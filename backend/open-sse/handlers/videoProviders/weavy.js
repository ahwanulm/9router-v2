import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { updateProviderConnection } from "@/lib/localDb";

// 10 MB buffer — video polling can produce large stderr logs
const MAX_BUFFER = 10 * 1024 * 1024;

// Timeout slightly longer than Python's own internal timeout (600 s for video)
// to let Python emit its own error rather than getting killed by Node.
const EXEC_TIMEOUT_MS = 660_000; // 11 minutes

export default {
  async generate(credentials, prompt, body, log) {
    const email = credentials.email || credentials.name || "";
    const token = credentials.accessToken || credentials.apiKey || "";
    const model = body.model || "";
    const modelId = model.replace(/^weavy-/, "");
    const size = body.aspect_ratio || body.size || "16:9";
    const duration = body.duration ? parseInt(body.duration) : null;
    const imageUrl = body.image_url || body.imageReference || body.start_frame || body.startFrame || "";
    const endImageUrl = body.end_image_url || body.endFrame || body.end_frame || "";
    const videoUrl = body.video_url || body.videoReference || "";
    const negativePrompt = body.negative_prompt || "";

    log?.debug?.(
      "WEAVY_VIDEO",
      `Running video generation via python: email=${email}, model=${modelId}, prompt="${prompt.slice(0, 30)}..." dur=${duration} img=${imageUrl ? "yes" : "no"} endImg=${endImageUrl ? "yes" : "no"} vid=${videoUrl ? "yes" : "no"} negPrompt=${negativePrompt ? "yes" : "no"}`
    );

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
        "--model-type", "video",
        "--model", modelId,
        "--profiles-dir", profilesDir,
        "--token", token,
      ];
      if (duration !== null && !isNaN(duration)) {
        args.push("--duration", duration.toString());
      }
      if (imageUrl) {
        args.push("--image-url", imageUrl);
      }
      if (endImageUrl) {
        args.push("--end-image-url", endImageUrl);
      }
      if (videoUrl) {
        args.push("--video-url", videoUrl);
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
      // Parse python JSON error from stdout if available
      if (err.stdout) {
        try {
          const parsed = JSON.parse(err.stdout.trim());
          if (parsed.message) {
            const cleanedMessage = token ? parsed.message.split(token).join("[REDACTED_JWT_TOKEN]") : parsed.message;
            const customErr = new Error(cleanedMessage);
            const statusMatch = cleanedMessage.match(/(?:Status|HTTP) (\d+)/i);
            if (statusMatch) {
              customErr.status = parseInt(statusMatch[1], 10);
            }
            if (customErr.stack && token) {
              customErr.stack = customErr.stack.split(token).join("[REDACTED_JWT_TOKEN]");
            }
            throw customErr;
          }
        } catch (parseErr) {
          if (!(parseErr instanceof SyntaxError)) {
            if (parseErr.message && token) {
              parseErr.message = parseErr.message.split(token).join("[REDACTED_JWT_TOKEN]");
            }
            if (parseErr.stack && token) {
              parseErr.stack = parseErr.stack.split(token).join("[REDACTED_JWT_TOKEN]");
            }
            throw parseErr;
          }
        }
      }

      // Redact token from error message, stack, and stderr before logging / re-throwing
      if (err.message) {
        const statusMatch = err.message.match(/(?:Status|HTTP) (\d+)/i);
        if (statusMatch) {
          err.status = parseInt(statusMatch[1], 10);
        }
        if (token) {
          err.message = err.message.split(token).join("[REDACTED_JWT_TOKEN]");
        }
      }
      if (err.stack && token) {
        err.stack = err.stack.split(token).join("[REDACTED_JWT_TOKEN]");
      }
      if (err.stderr && token) {
        err.stderr = err.stderr.split(token).join("[REDACTED_JWT_TOKEN]");
      }

      // Log stderr so the caller can see what Python printed
      if (err.stderr) {
        log?.debug?.("WEAVY_VIDEO", `stderr: ${err.stderr.slice(0, 500)}`);
      }
      // killed === true means Node killed the process (timeout or OOM)
      if (err.killed || err.code === "ETIMEDOUT") {
        const timeoutErr = new Error("Weavy video generation timed out (Node exec limit)");
        if (timeoutErr.stack && token) {
          timeoutErr.stack = timeoutErr.stack.split(token).join("[REDACTED_JWT_TOKEN]");
        }
        throw timeoutErr;
      }
      throw err;
    }

    // Surface Python stderr for debugging (trimmed to avoid log spam)
    if (stderr) {
      const cleanedStderr = token ? stderr.split(token).join("[REDACTED_JWT_TOKEN]") : stderr;
      log?.debug?.("WEAVY_VIDEO", `python stderr: ${cleanedStderr.slice(0, 500)}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch (parseErr) {
      const cleanedStdout = token ? stdout.slice(0, 200).split(token).join("[REDACTED_JWT_TOKEN]") : stdout.slice(0, 200);
      log?.debug?.("WEAVY_VIDEO", `JSON parse failed. stdout="${cleanedStdout}"`);
      const customErr = new Error(`Weavy video returned non-JSON output: ${cleanedStdout}`);
      if (customErr.stack && token) {
        customErr.stack = customErr.stack.split(token).join("[REDACTED_JWT_TOKEN]");
      }
      throw customErr;
    }

    if (parsed.status === "success" && Array.isArray(parsed.urls)) {
      // If Python refreshed the token, propagate it so the caller can persist it
      const result = { urls: parsed.urls };
      const connId = credentials.connectionId || credentials.id;
      if (connId) {
        const updates = {};
        if (parsed.balance !== undefined) {
          updates.last_balance = parsed.balance;
        }
        if (parsed.refreshed_token) {
          result.refreshedToken = parsed.refreshed_token;
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
      return result;
    } else {
      const errMsg = parsed.message || "Weavy video generation failed";
      const cleanedMsg = token ? errMsg.split(token).join("[REDACTED_JWT_TOKEN]") : errMsg;
      const apiErr = new Error(cleanedMsg);
      const statusMatch = cleanedMsg.match(/(?:Status|HTTP) (\d+)/i);
      if (statusMatch) {
        apiErr.status = parseInt(statusMatch[1], 10);
      }
      if (apiErr.stack && token) {
        apiErr.stack = apiErr.stack.split(token).join("[REDACTED_JWT_TOKEN]");
      }
      throw apiErr;
    }
  },
};
