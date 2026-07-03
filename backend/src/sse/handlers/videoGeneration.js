import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth.js";
import { getSettings } from "../../lib/localDb.js";
import { getModelInfo } from "../services/model.js";
import { handleVideoGenerationCore } from "open-sse/handlers/videoGenerationCore.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { checkAndRefreshToken, updateProviderCredentials } from "../services/tokenRefresh.js";
import { saveUsageStats, buildRequestDetail } from "open-sse/handlers/chatCore/requestDetail.js";
import { saveRequestDetail } from "../../lib/usageDb.js";
import * as log from "../utils/logger.js";

/**
 * Handle video generation request
 * @param {Request} request
 */
export async function handleVideoGeneration(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  const modelStr = body.model;

  const apiKey = extractApiKey(request);
  const settings = await getSettings();
  if (settings.requireApiKey) {
    if (!apiKey) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    const valid = await isValidApiKey(apiKey);
    if (!valid) return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
  }

  if (!modelStr) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  if (!body.prompt) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: prompt");

  return handleSingleModelVideo(body, modelStr, { apiKey });
}

async function handleSingleModelVideo(body, modelStr, { apiKey } = {}) {
  const modelInfo = await getModelInfo(modelStr);
  if (!modelInfo.provider) return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");

  const { provider, model } = modelInfo;

  // Credential fallback loop
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    log.info("AUTH_PIN", `Body connection_id: ${body.connection_id}, preferred_connection_id: ${body.preferred_connection_id}`);
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model, {
      image_url: body.image_url || body.imageReference,
      video_url: body.video_url || body.videoReference,
      start_frame: body.start_frame || body.startFrame,
      end_frame: body.end_frame || body.endFrame,
      preferredConnectionId: body.preferred_connection_id || body.connection_id,
    });

    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
      }
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);

    const result = await handleVideoGenerationCore({
      body,
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      log,
      onRequestSuccess: async () => {
        await clearAccountError(credentials.connectionId, credentials, model);
        
        const usage = { prompt_tokens: 0, completion_tokens: 1 };
        saveUsageStats({ provider, model, tokens: usage, connectionId: credentials.connectionId, apiKey, label: "VIDEO USAGE" });
        saveRequestDetail(buildRequestDetail({
          provider, model, connectionId: credentials.connectionId,
          latency: { ttft: 0, total: 0 },
          tokens: usage,
          request: { model, prompt: body.prompt },
          response: { type: "video" },
          status: "success"
        }, { endpoint: "/v1/video/generations" })).catch(() => {});
      },
      onRequestFailure: async (err) => {
        let statusCode = err?.status;
        if (!statusCode && err?.message) {
          const match = err.message.match(/(?:Status|HTTP) (\d+)/i);
          if (match) {
            statusCode = parseInt(match[1], 10);
          }
        }
        statusCode = statusCode || 502;
        await markAccountUnavailable(credentials.connectionId, statusCode, err?.message || "Unknown error", provider, model);
      }
    });

    if (result.success) return result.response;

    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model);

    if (shouldFallback) {
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }

    return result.response;
  }
}
