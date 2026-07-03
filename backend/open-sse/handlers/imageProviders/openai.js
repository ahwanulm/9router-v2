/**
 * OpenAI-compatible image generation adapter.
 *
 * Providers: openai | minimax | openrouter | recraft | xai
 * Auth: Bearer token via Authorization header (apiKey or accessToken)
 * Format: JSON body → sync JSON response
 * Polling: None (synchronous)
 *
 * Supported request params:
 * @param {string}  prompt                    - (required) Image description
 * @param {string}  [model]                   - Model ID (set by caller)
 * @param {number}  [n=1]                     - Number of images (1–10 for DALL-E 2; 1 for DALL-E 3/GPT Image 1)
 * @param {string}  [size="1024x1024"]        - Dimensions: "256x256"|"512x512"|"1024x1024"|"1792x1024"|"1024x1792"
 * @param {string}  [quality="standard"]      - "standard"|"hd"|"low"|"medium"|"high"|"auto"
 * @param {string}  [style]                   - DALL-E 3 only: "vivid"|"natural"
 * @param {string}  [response_format="url"]   - "url"|"b64_json"
 * @param {string}  [output_format]           - GPT Image 1 only: "png"|"jpeg"|"webp"
 * @param {string}  [background]              - GPT Image 1 only: "auto"|"transparent"|"opaque"
 *
 * xAI note: only prompt, model, n, response_format are forwarded.
 */
// OpenAI-compatible adapter (used by openai, minimax, openrouter, recraft)

const ENDPOINTS = {
  openai: "https://api.openai.com/v1/images/generations",
  minimax: "https://api.minimaxi.com/v1/images/generations",
  openrouter: "https://openrouter.ai/api/v1/images/generations",
  recraft: "https://external.api.recraft.ai/v1/images/generations",
  xai: "https://api.x.ai/v1/images/generations",
};

export default function createOpenAIAdapter(providerId) {
  return {
    buildUrl: () => ENDPOINTS[providerId],
    buildHeaders: (creds) => {
      const headers = { "Content-Type": "application/json" };
      const key = creds?.apiKey || creds?.accessToken;
      if (key) headers["Authorization"] = `Bearer ${key}`;
      if (providerId === "openrouter") {
        headers["HTTP-Referer"] = "https://endpoint-proxy.local";
        headers["X-Title"] = "Endpoint Proxy";
      }
      return headers;
    },
    buildBody: (model, body) => {
      const { prompt, n = 1, size = "1024x1024", quality, style, response_format } = body;
      // xAI only accepts prompt, model, n, response_format
      if (providerId === "xai") {
        const req = { model, prompt, n };
        if (response_format) req.response_format = response_format;
        return req;
      }
      const req = { model, prompt, n, size };
      if (quality) req.quality = quality;
      if (style) req.style = style;
      if (response_format) req.response_format = response_format;
      return req;
    },
    normalize: (responseBody) => responseBody,
  };
}
