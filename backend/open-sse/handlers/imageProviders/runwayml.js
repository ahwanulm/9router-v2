/**
 * RunwayML image and video generation adapter.
 *
 * Providers: runwayml
 * Auth: Bearer token + X-Runway-Version header
 * Format: JSON body → async polling
 * Polling: Yes — polls task ID until status == "SUCCEEDED"
 *
 * Model routing:
 * - "*_image*" model IDs → POST /text_to_image (image generation)
 * - all others           → POST /image_to_video (video generation)
 *
 * Image model params:
 * @param {string}  prompt         - (required) Image description (sent as promptText)
 * @param {string}  [size]         - Maps to ratio: "1:1"|"16:9"|"9:16" etc.
 * @param {string}  [image]        - Reference image URL (referenceImages[])
 *
 * Video model params:
 * @param {string}  prompt         - (required) Video description (promptText)
 * @param {string}  [image]        - Start frame URL (promptImage)
 * @param {number}  [duration=5]   - Video duration in seconds
 * @param {string}  [resolution]   - "720p"|"1080p"
 *
 * Response normalize: output[] → { created, data: [{ url }] }.
 */
// Runway ML — async submit + /tasks/{id} polling
import { sleep, nowSec, sizeToAspectRatio, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from "./_base.js";

const BASE_URL = "https://api.dev.runwayml.com/v1";

export default {
  async: true,
  buildUrl: (model) => {
    // Image models (gen4_image*) → text_to_image; video models → image_to_video
    return `${BASE_URL}/${model.includes("image") ? "text_to_image" : "image_to_video"}`;
  },
  buildHeaders: (creds) => {
    const key = creds?.apiKey || creds?.accessToken;
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "X-Runway-Version": "2024-11-06",
    };
  },
  buildBody: (model, body) => {
    const isVideo = !model.includes("image");
    const ratio = sizeToAspectRatio(body.size);
    if (isVideo) {
      return { promptText: body.prompt, model, ratio, duration: 5, ...(body.image ? { promptImage: body.image } : {}) };
    }
    return { promptText: body.prompt, model, ratio, ...(body.image ? { referenceImages: [{ uri: body.image }] } : {}) };
  },
  async parseResponse(response, { headers }) {
    const { id } = await response.json();
    if (!id) throw new Error("Runway: no task id returned");
    const taskUrl = `${BASE_URL}/tasks/${id}`;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const r = await fetch(taskUrl, { headers });
      if (!r.ok) throw new Error(`Runway status ${r.status}`);
      const s = await r.json();
      if (s.status === "SUCCEEDED") return s;
      if (s.status === "FAILED" || s.status === "CANCELLED") throw new Error(s.failure || "Runway task failed");
    }
    throw new Error("Runway polling timeout");
  },
  normalize: (responseBody) => {
    const outputs = Array.isArray(responseBody.output) ? responseBody.output : [];
    return { created: nowSec(), data: outputs.map((url) => ({ url })) };
  },
};
