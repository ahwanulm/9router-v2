/**
 * Weavy AI image and video generation adapter.
 *
 * Providers: weavy
 * Auth: Firebase JWT Bearer token + x-weavy-* headers
 *       Requires: accessToken (or apiKey), optionally email/connectionName
 * Format: POST duplicate-recipe → then delegates to weavy_generate.py subprocess
 * Polling: Handled entirely by weavy_generate.py (polls Weavy batch status)
 *
 * MODEL TYPE DETECTION:
 * - Model IDs registered as type="image" → --model-type image
 * - Model IDs registered as type="video" → --model-type video
 * - Detected at runtime by checking PROVIDER_MODELS registry
 *
 * NOTE: Weavy image models use FAL-style image_size names (square_hd, portrait_16_9, etc.).
 *       The backend (weavy_service.py) maps these to the appropriate format per model:
 *       - FAL models: image_size = "portrait_16_9" etc. (passed directly)
 *       - Replicate/Google: aspect_ratio = "9:16" etc. (converted from FAL name)
 *       - GPT Image 2: size = "1024x1536" etc. (converted via size_map)
 *
 * Supported request params (image models):
 * @param {string}  prompt              - (required) Image/video description
 * @param {string}  [size="1:1"]        - Aspect ratio: "1:1"|"16:9"|"9:16"|"4:3"|"3:2"|"2:3"
 * @param {string}  [negative_prompt]   - Elements to exclude (model-dependent)
 * @param {string}  [image_url]         - Reference/start-frame image URL
 *
 * Additional params for video models:
 * @param {number}  [duration]          - Duration in seconds (model-specific: 5/8/10 etc.)
 * @param {string}  [video_url]         - Reference video URL (motion-strength models)
 * @param {string}  [end_image_url]     - End/last-frame image URL (first-last-frame models)
 *
 * Headers:
 * @header Authorization              Bearer {token}
 * @header x-weavy-auth-provider      "firebase"
 * @header x-weavy-token              JWT token
 * @header x-weavy-email              User email
 */
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { PROVIDER_MODELS } from "../../config/providerModels.js";
import { updateProviderConnection } from "@/lib/localDb";

const TEMPLATE_ID = "SZXXYN7L9PN2SCTVYAlt";

// 10 MB buffer — avoids ENOBUFS on heavy stderr logs
const MAX_BUFFER = 10 * 1024 * 1024;
// Timeout slightly longer than Python's own 180 s image timeout
const EXEC_TIMEOUT_MS = 240_000; // 4 minutes

export default {
  skipFetch: true,

  buildUrl: (_model, _creds) => {
    return `https://api.weavy.ai/api/v1/recipes/${TEMPLATE_ID}/duplicate`;
  },

  buildHeaders: (...args) => {
    const creds = args[0];
    const token = creds?.accessToken || creds?.apiKey || "";
    const email = creds?.email || creds?.name || creds?.connectionName || "";
    const connectionId = creds?.connectionId || creds?.id || "";
    return {
      "x-weavy-auth-provider": "firebase",
      "x-app-version": "4.1.489",
      "authorization": `Bearer ${token}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "x-weavy-email": email,
      "x-weavy-token": token,
      "x-weavy-connection-id": connectionId,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    };
  },

  buildBody: async (_model, _body) => {
    return {};
  },

  async parseResponse(response, { headers, log, model, body }) {
    const email = headers["x-weavy-email"] || "";
    const token = headers["x-weavy-token"] || "";
    const connId = headers["x-weavy-connection-id"] || "";
    const prompt = body.prompt || "";
    const size = body.size || "1:1";
    const modelId = model.replace(/^weavy-/, "");
    const imageUrl = body.image_url || body.imageReference || body.start_frame || body.startFrame || "";
    const endImageUrl = body.end_image_url || body.endImageUrl || "";
    const videoUrl = body.video_url || body.videoUrl || "";
    const negativePrompt = body.negative_prompt || "";
    const duration = body.duration ? parseInt(body.duration, 10) : undefined;

    // Detect model type from registry (image vs video)
    const weavyModels = PROVIDER_MODELS["weavy"] || [];
    const modelEntry = weavyModels.find(m => m.id === model);
    const modelType = modelEntry?.type === "video" ? "video" : "image";

    log?.debug?.("WEAVY", `Running generation via python: email=${email}, model=${modelId}, type=${modelType}, prompt="${prompt.slice(0, 30)}..." img=${imageUrl ? "yes" : "no"} endImg=${endImageUrl ? "yes" : "no"} video=${videoUrl ? "yes" : "no"} dur=${duration ?? "none"} negPrompt=${negativePrompt ? "yes" : "no"}`);

    const venvPython = path.resolve(process.cwd(), ".venv/bin/python");
    const scriptPath = path.resolve(process.cwd(), "src/automation/weavy_generate.py");
    const profilesDir = path.resolve(process.cwd(), "profiles/weavy");
    
    const execFileAsync = promisify(execFile);
    let stdout;
    let stderr;
    try {
      const args = [
        scriptPath,
        "--email", email,
        "--prompt", prompt,
        "--aspect-ratio", size,
        "--model-type", modelType,
        "--model", modelId,
        "--profiles-dir", profilesDir,
        "--token", token,
      ];
      if (imageUrl) {
        args.push("--image-url", imageUrl);
      }
      if (endImageUrl) {
        args.push("--end-image-url", endImageUrl);
      }
      if (videoUrl) {
        args.push("--video-url", videoUrl);
      }
      if (duration !== undefined && !isNaN(duration)) {
        args.push("--duration", String(duration));
      }
      if (negativePrompt) {
        args.push("--negative-prompt", negativePrompt);
      }

      const res = await execFileAsync(venvPython, args, {
        maxBuffer: MAX_BUFFER,
        timeout: EXEC_TIMEOUT_MS,
      });
      stdout = res.stdout;
      stderr = res.stderr;
    } catch (err) {
      if (err.message && token) {
        err.message = err.message.split(token).join("[REDACTED_JWT_TOKEN]");
      }
      if (err.stderr) {
        log?.debug?.("WEAVY", `stderr: ${err.stderr.slice(0, 500)}`);
      }
      if (err.killed || err.code === "ETIMEDOUT") {
        throw new Error("Weavy image generation timed out (Node exec limit)");
      }
      // Surface actual Python error message from stdout JSON (e.g. "only available on paid plans").
      // When Python exits with code 1, execFile throws with a generic "Command failed: ..." message
      // and the real error sits in err.stdout — which error classification rules can't match.
      if (err.stdout) {
        try {
          const pyOut = JSON.parse(err.stdout.trim());
          if (pyOut?.message) {
            const actualMsg = token ? pyOut.message.split(token).join("[REDACTED_JWT_TOKEN]") : pyOut.message;
            log?.debug?.("WEAVY", `python error: ${actualMsg.slice(0, 300)}`);
            throw new Error(actualMsg);
          }
        } catch (innerErr) {
          if (innerErr !== err) throw innerErr; // re-throw the new Error we just constructed
          // stdout wasn't valid JSON → fall through to original error
        }
      }
      throw err;
    }

    // Surface Python stderr for debugging
    if (stderr) {
      log?.debug?.("WEAVY", `python stderr: ${stderr.slice(0, 500)}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch (parseErr) {
      log?.debug?.("WEAVY", `JSON parse failed. stdout="${stdout.slice(0, 200)}"`);
      throw new Error(`Weavy image returned non-JSON output: ${stdout.slice(0, 200)}`);
    }

    if (parsed.status === "success" && Array.isArray(parsed.urls)) {
      if (connId) {
        const updates = {};
        if (parsed.balance !== undefined) {
          updates.last_balance = parsed.balance;
        }
        if (parsed.refreshed_token) {
          updates.accessToken = parsed.refreshed_token;
          updates.cached_jwt = parsed.refreshed_token;
          updates.testStatus = "active";
          try {
            const payload = JSON.parse(Buffer.from(parsed.refreshed_token.split('.')[1], 'base64').toString());
            if (payload && payload.exp) {
              updates.jwt_expires_at = payload.exp;
              updates.expiresAt = new Date(payload.exp * 1000).toISOString();
            }
          } catch (e) {
            const exp = Math.floor(Date.now() / 1000) + 3600;
            updates.jwt_expires_at = exp;
            updates.expiresAt = new Date(exp * 1000).toISOString();
          }
        }
        if (Object.keys(updates).length > 0) {
          updateProviderConnection(connId, updates).catch(() => {});
        }
      }
      return {
        created: Math.floor(Date.now() / 1000),
        data: parsed.urls.map(url => ({ url }))
      };
    } else {
      throw new Error(parsed.message || "Weavy generation failed");
    }
  },

  normalize: (parsed) => {
    if (parsed?.created && Array.isArray(parsed?.data)) return parsed;
    const urls = Array.isArray(parsed?.data) ? parsed.data : [];
    return { created: Math.floor(Date.now() / 1000), data: urls };
  },
};
