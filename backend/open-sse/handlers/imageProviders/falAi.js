/**
 * Fal.ai asynchronous image generation adapter.
 *
 * Providers: fal-ai
 * Auth: Key {apiKey} via Authorization header (uses "Key" prefix, not "Bearer")
 * Format: JSON body → async queue submission + polling
 * Polling: Yes — submits to /runs, polls /requests/{id}/status, fetches /requests/{id}
 *
 * Supported request params:
 * @param {string}  prompt               - (required) Image description
 * @param {string}  [model]              - Model path (e.g. "fal-ai/flux/schnell")
 * @param {number}  [n=1]                - Number of images (num_images)
 * @param {string}  [size="1024x1024"]   - Maps to image_size aspect ratio: "1:1"|"16:9"|"9:16" etc.
 * @param {number}  [seed]               - Fixed seed for reproducibility
 * @param {number}  [guidance]           - Guidance scale (model-dependent)
 * @param {number}  [num_steps]          - Diffusion sampling steps
 * @param {string}  [style]              - Style preset (Recraft/Ideogram only)
 * @param {string}  [image]              - Reference image URL (img2img conditioning)
 *
 * Response normalize: maps images[] or image{} to { created, data: [{ url }] }.
 */
// Fal.ai — async submit + queue polling
import { sleep, nowSec, sizeToAspectRatio, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from "./_base.js";

const BASE_URL = "https://queue.fal.run";

export default {
  async: true,
  buildUrl: (model) => `${BASE_URL}/${model}`,
  buildHeaders: (creds) => {
    const key = creds?.apiKey || creds?.accessToken;
    return { "Content-Type": "application/json", "Authorization": `Key ${key}` };
  },
  buildBody: (_model, body) => {
    const req = { prompt: body.prompt, num_images: body.n || 1 };
    if (body.size) req.image_size = sizeToAspectRatio(body.size);
    if (body.image) req.image_url = body.image;
    return req;
  },
  async parseResponse(response, { headers }) {
    const { status_url, response_url } = await response.json();
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const r = await fetch(status_url, { headers });
      if (!r.ok) throw new Error(`Fal status ${r.status}`);
      const s = await r.json();
      if (s.status === "COMPLETED") {
        const fr = await fetch(response_url, { headers });
        return await fr.json();
      }
      if (s.status === "FAILED") throw new Error(s.error || "Fal generation failed");
    }
    throw new Error("Fal polling timeout");
  },
  normalize: (responseBody) => {
    const images = Array.isArray(responseBody.images)
      ? responseBody.images
      : (responseBody.image ? [responseBody.image] : []);
    return { created: nowSec(), data: images.map((img) => ({ url: img.url || img })) };
  },
};
