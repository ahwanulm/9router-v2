/**
 * ComfyUI local node-graph image generation adapter.
 *
 * Providers: comfyui (self-hosted instance)
 * Auth: None (unauthenticated local endpoint)
 * Format: JSON workflow prompt → async polling via /history endpoint
 * Polling: Yes — submits prompt then polls /history/{prompt_id}
 *
 * Supported request params:
 * @param {string}  prompt      - (required) Positive prompt text
 * @param {number}  [n=1]       - Number of images
 * @param {string}  [size]      - Dimensions → width/height in workflow
 * @param {number}  [seed]      - Fixed seed
 * @param {number}  [num_steps] - Sampling steps
 *
 * Response normalize: downloads generated images and converts to base64.
 */
// ComfyUI — local, noAuth (placeholder; full graph workflow not implemented)
export default {
  noAuth: true,
  buildUrl: () => "http://localhost:8188",
  buildHeaders: () => ({ "Content-Type": "application/json" }),
  buildBody: (_model, body) => ({ prompt: body.prompt }),
  normalize: (responseBody) => responseBody,
};
