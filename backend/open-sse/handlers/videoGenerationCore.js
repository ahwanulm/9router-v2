import { createErrorResult } from "../utils/error.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";
import { getVideoAdapter } from "./videoProviders/index.js";

/**
 * Core video generation handler — orchestrator only.
 * Provider-specific logic lives in `./videoProviders/{id}.js`.
 *
 * Each adapter exports a `generate(credentials, prompt, body, log)` method
 * that returns `{ urls: string[], genId: string }`.
 *
 * @param {object} options
 * @param {object} options.body  - Request body { model, prompt, size, duration, ... }
 * @param {object} options.modelInfo - { provider, model }
 * @param {object} options.credentials - Provider credentials
 * @param {object} [options.log] - Logger
 * @param {function} [options.onRequestSuccess]
 * @returns {Promise<{ success: boolean, response: Response, status?: number, error?: string }>}
 */
export async function handleVideoGenerationCore({
  body,
  modelInfo,
  credentials,
  log,
  onRequestSuccess,
  onRequestFailure,
}) {
  const { provider, model } = modelInfo;

  if (!body.prompt) {
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, "Missing required field: prompt");
  }

  const adapter = getVideoAdapter(provider);
  if (!adapter) {
    return createErrorResult(
      HTTP_STATUS.BAD_REQUEST,
      `Provider '${provider}' does not support video generation`
    );
  }

  log?.debug?.("VIDEO", `${provider.toUpperCase()} | ${model} | prompt="${(body.prompt || "").slice(0, 50)}..."`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send a single space immediately to force Cloudflare to flush headers
      try {
        controller.enqueue(encoder.encode(" "));
      } catch (e) {
        log?.debug?.("VIDEO", `Stream start enqueue error: ${e.message}`);
      }

      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(" "));
        } catch (e) {
          clearInterval(interval);
        }
      }, 15000);

      try {
        const result = await adapter.generate(credentials, body.prompt, { ...body, model }, log);
        clearInterval(interval);

        if (onRequestSuccess) await onRequestSuccess();

        const created = Math.floor(Date.now() / 1000);
        const urls = result?.urls || [];
        const responseBody = {
          created,
          data: urls.map((url) => ({ url })),
          model,
          provider,
        };

        controller.enqueue(encoder.encode(JSON.stringify(responseBody)));
        controller.close();
      } catch (error) {
        clearInterval(interval);
        const msg = error?.message || `${provider} video generation failed`;
        log?.debug?.("VIDEO", `Error: ${msg}`);

        if (onRequestFailure) {
          try {
            await onRequestFailure(error);
          } catch (failErr) {
            log?.debug?.("VIDEO", `onRequestFailure callback error: ${failErr.message}`);
          }
        }
        
        const errorBody = {
          error: {
            message: msg,
            type: "api_error",
            code: "bad_gateway",
          }
        };
        try {
          controller.enqueue(encoder.encode(JSON.stringify(errorBody)));
        } catch (e) {}
        controller.close();
      }
    }
  });

  return {
    success: true,
    response: new Response(stream, {
      headers: {
        "Content-Type": "application/json",
        "X-Accel-Buffering": "no",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    }),
  };
}
