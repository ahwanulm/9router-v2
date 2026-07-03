/**
 * Stability AI v2beta image generation adapter.
 *
 * Providers: stability-ai
 * Auth: Bearer token via Authorization header (apiKey or accessToken)
 * Format: JSON body → sync JSON response ({ image: "<b64>" })
 * Polling: None (synchronous)
 *
 * Endpoint routing by model:
 * - "stable-image-ultra" → /ultra
 * - "sd3*"               → /sd3
 * - all others           → /core
 *
 * Supported request params:
 * @param {string}  prompt                   - (required) Image description
 * @param {string}  [size="1024x1024"]       - Maps to aspect_ratio: "1:1"|"16:9"|"9:16"|"4:3"|"3:2"|"2:3"
 * @param {string}  [style]                  - Style preset (core only): "anime"|"photographic"|"cinematic" etc.
 * @param {string}  [negative_prompt]        - Elements to exclude
 * @param {number}  [seed]                   - Fixed seed
 * @param {number}  [guidance]               - CFG scale
 * @param {string}  [output_format="png"]    - "png"|"jpeg"|"webp"
 * @param {string}  [model]                  - SD3 only: "sd3.5-large"|"sd3.5-large-turbo"|"sd3.5-medium"
 *
 * Response normalize: { image: b64 } → { created, data: [{ b64_json }] }.
 */
// Stability AI v2 — sync, returns { image: "<b64>" }
import { nowSec, sizeToAspectRatio } from "./_base.js";

const BASE_URL = "https://api.stability.ai/v2beta/stable-image/generate";

// Map model id → endpoint segment
function modelToEndpoint(model) {
  if (model.includes("ultra")) return "ultra";
  if (model.includes("sd3")) return "sd3";
  return "core";
}

export default {
  buildUrl: (model) => `${BASE_URL}/${modelToEndpoint(model)}`,
  buildHeaders: (creds) => {
    const key = creds?.apiKey || creds?.accessToken;
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "Accept": "application/json",
    };
  },
  buildBody: (model, body) => {
    const req = { prompt: body.prompt, output_format: (body.output_format || "png").toLowerCase() };
    if (body.size) req.aspect_ratio = sizeToAspectRatio(body.size);
    if (body.style) req.style_preset = body.style;
    if (model.includes("sd3")) req.model = model;
    return req;
  },
  normalize: (responseBody) => {
    if (responseBody.image) return { created: nowSec(), data: [{ b64_json: responseBody.image }] };
    return { created: nowSec(), data: [] };
  },
};
