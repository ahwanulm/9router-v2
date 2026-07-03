/**
 * Google Gemini multimodal image generation adapter.
 *
 * Providers: gemini (via NanoBanana tier routing)
 * Auth: API key appended as ?key= query param
 * Format: JSON body → sync JSON response (generateContent / generateImage)
 * Polling: None (synchronous)
 *
 * Supported request params:
 * @param {string} prompt  - (required) Image description text
 *
 * Notes:
 * - No size, quality, or style params are supported by the Gemini image endpoint.
 * - Response is normalized to { created, data: [{ b64_json, revised_prompt }] }.
 */
// Google Gemini adapter (Nano Banana models)
import { nowSec } from "./_base.js";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export default {
  buildUrl: (model, creds) => {
    const apiKey = creds?.apiKey || creds?.accessToken;
    const modelId = model.replace(/^models\//, "");
    return `${BASE_URL}/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
  },
  buildHeaders: () => ({ "Content-Type": "application/json" }),
  buildBody: (_model, body) => ({
    contents: [{ parts: [{ text: body.prompt }] }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  }),
  normalize: (responseBody, prompt) => {
    const parts = responseBody.candidates?.[0]?.content?.parts || [];
    const images = parts.filter((p) => p.inlineData?.data).map((p) => ({ b64_json: p.inlineData.data }));
    return {
      created: nowSec(),
      data: images.length > 0 ? images : [{ b64_json: "", revised_prompt: prompt }],
    };
  },
};
