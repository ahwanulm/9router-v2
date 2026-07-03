/**
 * HuggingFace Inference API image generation adapter.
 *
 * Providers: huggingface
 * Auth: Bearer token via Authorization header (apiKey or accessToken)
 * Format: JSON body { inputs: prompt } → binary image response (PNG/JPEG)
 * Polling: None (synchronous, may queue on HF side)
 *
 * Supported request params:
 * @param {string} prompt  - (required) Image description text
 *
 * Notes:
 * - Only "inputs" (prompt) is accepted by the HF Inference endpoint.
 * - No size, quality, style, or other params are passed through.
 * - Response normalize: converts raw binary image to base64 data URI.
 */
// HuggingFace Inference API — returns binary image
import { nowSec } from "./_base.js";

const BASE_URL = "https://api-inference.huggingface.co/models";

export default {
  buildUrl: (model) => `${BASE_URL}/${model}`,
  buildHeaders: (creds) => {
    const headers = { "Content-Type": "application/json" };
    const key = creds?.apiKey || creds?.accessToken;
    if (key) headers["Authorization"] = `Bearer ${key}`;
    return headers;
  },
  buildBody: (_model, body) => ({ inputs: body.prompt }),
  // HF returns raw image bytes — convert to b64_json
  async parseResponse(response) {
    const buf = await response.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return { created: nowSec(), data: [{ b64_json: base64 }] };
  },
  normalize: (responseBody) => responseBody,
};
