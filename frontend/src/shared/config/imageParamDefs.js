/**
 * Image Generation — Canonical Parameter Schema Library
 *
 * This file is the single source of truth for all parameter definitions
 * used by image (and video) generation models across every provider.
 *
 * Each entry in IMAGE_PARAMS fully describes one request parameter:
 *   name        — param key as sent in the API body
 *   type        — "string" | "integer" | "number" | "boolean"
 *   required    — whether the API will reject requests missing this param
 *   default     — value used when param is omitted (null = provider decides)
 *   validValues — exhaustive list of accepted string values (null = freeform)
 *   min / max   — numeric bounds (only for type "integer" / "number")
 *   description — human-readable explanation shown in UI and docs
 *
 * Usage:
 *   import { pd, p } from "./imageParamDefs.js";
 *
 *   // Build paramDefs from a list of names (with optional per-name overrides)
 *   pd(["size", "n", "quality"])
 *   pd(["size"], { size: { validValues: ["1:1", "16:9"] } })
 *
 *   // Get a single param def (with optional overrides)
 *   p("size")
 *   p("size", { validValues: ["1024x1024", "1792x1024"] })
 */

// ─── Standard OpenAI size strings ────────────────────────────────────────────
const STD_SIZES   = ["1024x1024", "1792x1024", "1024x1792", "1024x1536", "1536x1024"];
const DALLE3_SIZES = ["1024x1024", "1792x1024", "1024x1792"];
const DALLE2_SIZES = ["256x256", "512x512", "1024x1024"];
const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];

// ─── Canonical param definitions ─────────────────────────────────────────────
export const IMAGE_PARAMS = {

  // ── Dimensions ──────────────────────────────────────────────────────────────

  size: {
    name: "size",
    type: "string",
    required: false,
    default: "1024x1024",
    validValues: STD_SIZES,
    description: "Output image dimensions as 'WIDTHxHEIGHT'. Standard: 1024×1024 (square), 1792×1024 (landscape), 1024×1792 (portrait).",
  },

  aspect_ratio: {
    name: "aspect_ratio",
    type: "string",
    required: false,
    default: "1:1",
    validValues: ASPECT_RATIOS,
    description: "Output aspect ratio. Used by providers that accept ratio strings instead of pixel dimensions.",
  },

  // ── Quantity ─────────────────────────────────────────────────────────────────

  n: {
    name: "n",
    type: "integer",
    required: false,
    default: 1,
    min: 1,
    max: 4,
    description: "Number of images to generate in a single request (1–4).",
  },

  // ── Quality & style ──────────────────────────────────────────────────────────

  quality: {
    name: "quality",
    type: "string",
    required: false,
    default: "standard",
    validValues: ["standard", "hd", "low", "medium", "high", "auto"],
    description: "Image rendering quality. Higher quality produces more detailed images but may take longer. Provider-specific values apply.",
  },

  style: {
    name: "style",
    type: "string",
    required: false,
    default: null,
    validValues: ["vivid", "natural", "anime", "realistic", "digital-art"],
    description: "Artistic style preset. 'vivid' produces hyper-real images; 'natural' is more subdued. Provider-specific presets may apply.",
  },

  output_format: {
    name: "output_format",
    type: "string",
    required: false,
    default: "png",
    validValues: ["png", "jpeg", "webp"],
    description: "Output image file format. 'png' supports transparency; 'jpeg'/'webp' are smaller for photos.",
  },

  // ── Response format ──────────────────────────────────────────────────────────

  response_format: {
    name: "response_format",
    type: "string",
    required: false,
    default: "url",
    validValues: ["url", "b64_json"],
    description: "How the image is returned: 'url' is a temporary public link; 'b64_json' is the raw image as a base64-encoded JSON string.",
  },

  // ── Reference inputs ─────────────────────────────────────────────────────────

  image_url: {
    name: "image_url",
    type: "string",
    required: false,
    default: null,
    description: "Reference image for img2img / conditioning. Accepts an HTTP URL or a base64 Data URI (data:image/png;base64,…). Used as the start frame or style reference.",
  },

  end_image_url: {
    name: "end_image_url",
    type: "string",
    required: false,
    default: null,
    description: "End/last-frame image URL for first-last-frame video models (e.g. Kling, Veo). The model interpolates video between image_url (start) and end_image_url (end).",
  },

  video_url: {
    name: "video_url",
    type: "string",
    required: false,
    default: null,
    description: "Reference video URL for video-to-video conditioning (e.g. motion transfer, style reference on video input).",
  },

  image: {
    name: "image",
    type: "string",
    required: false,
    default: null,
    description: "Input image for editing or conditioning. Accepts an HTTP URL or base64 Data URI. Identical in function to image_url — some providers use this key instead.",
  },

  mask_image: {
    name: "mask_image",
    type: "string",
    required: false,
    default: null,
    description: "Mask image for inpainting. White areas = regions to regenerate; black areas = regions to preserve. Accepts HTTP URL or base64 Data URI.",
  },

  negative_prompt: {
    name: "negative_prompt",
    type: "string",
    required: false,
    default: null,
    description: "Text describing elements to exclude from the generated image (e.g. 'blurry, low quality, watermark').",
  },

  // ── Advanced diffusion controls ──────────────────────────────────────────────

  seed: {
    name: "seed",
    type: "integer",
    required: false,
    default: null,
    description: "Fixed random seed for reproducible results. Same seed + same prompt → same image (when other settings are equal).",
  },

  guidance: {
    name: "guidance",
    type: "number",
    required: false,
    default: null,
    min: 0,
    max: 20,
    description: "Classifier-free guidance scale. Higher values make the output follow the prompt more closely but may reduce visual quality. Typical range: 5–15.",
  },

  num_steps: {
    name: "num_steps",
    type: "integer",
    required: false,
    default: null,
    min: 1,
    max: 50,
    description: "Number of diffusion sampling steps. More steps = higher quality, slower generation. Typical range: 20–50.",
  },

  strength: {
    name: "strength",
    type: "number",
    required: false,
    default: null,
    min: 0,
    max: 1,
    description: "Img2img denoising strength. 0 = identical to input; 1 = completely new image. Typical range: 0.5–0.9.",
  },

  // ── Codex / GPT-Image specific ───────────────────────────────────────────────

  background: {
    name: "background",
    type: "string",
    required: false,
    default: "auto",
    validValues: ["auto", "transparent", "opaque"],
    description: "Background mode (Codex/GPT Image only). 'transparent' requires output_format=png.",
  },

  image_detail: {
    name: "image_detail",
    type: "string",
    required: false,
    default: "high",
    validValues: ["low", "high", "auto"],
    description: "Detail level for input reference images (Codex/GPT Image only). 'high' uses more tokens but preserves fine detail.",
  },

  // ── Video-specific params ────────────────────────────────────────────────────

  duration: {
    name: "duration",
    type: "integer",
    required: false,
    default: 5,
    min: 1,
    max: 30,
    description: "Video duration in seconds. Supported range varies by model (e.g. 5–15s for Kling, fixed 8s for some Veo models).",
  },

  resolution: {
    name: "resolution",
    type: "string",
    required: false,
    default: null,
    validValues: ["480p", "720p", "1080p", "4k"],
    description: "Video output resolution. Higher resolutions require more generation time and cost.",
  },

  motion_strength: {
    name: "motion_strength",
    type: "number",
    required: false,
    default: null,
    min: 0,
    max: 1,
    description: "Camera/subject motion intensity for video generation. 0 = static / minimal movement; 1 = high dynamic motion.",
  },

  video_url: {
    name: "video_url",
    type: "string",
    required: false,
    default: null,
    description: "Reference video URL or base64 for video-to-video conditioning (start/end frame or motion reference).",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return the canonical param definition for a single param name,
 * with optional field-level overrides.
 *
 * @param {string} name - key in IMAGE_PARAMS
 * @param {object} [overrides] - partial fields to override on the base definition
 * @returns {object|null}
 */
export function p(name, overrides = {}) {
  const base = IMAGE_PARAMS[name];
  if (!base) return null;
  if (!overrides || Object.keys(overrides).length === 0) return base;
  return { ...base, ...overrides };
}

/**
 * Build a paramDefs array from a list of param names.
 * Unknown names are silently skipped.
 *
 * @param {string[]} names - list of param keys
 * @param {object}  [overrides] - map of { paramName: { field overrides } }
 * @returns {object[]}
 */
export function pd(names, overrides = {}) {
  return names
    .map(name => {
      const base = IMAGE_PARAMS[name];
      if (!base) return null;
      const ov = overrides[name];
      return ov ? { ...base, ...ov } : base;
    })
    .filter(Boolean);
}

// ─── Shared override groups (reused across providers) ─────────────────────────

/**
 * Weavy image models — frontend sends standard ratio strings (e.g. "9:16").
 * The backend (weavy_service.py) converts to FAL-style image_size internally.
 * Apply as: pd(["size", ...], WEAVY_SIZE_OV)
 */
export const WEAVY_SIZE_OV = {
  size: {
    default: "1:1",
    validValues: ["1:1", "9:16", "16:9", "3:4", "4:3"],
    description: "Output aspect ratio. Weavy converts this to the correct format per model (FAL image_size, Replicate aspect_ratio, or GPT Image pixel size).",
  },
};

/**
 * Standard aspect-ratio-only size param for providers that don't use WxH.
 */
export const RATIO_SIZE_OV = {
  size: {
    validValues: ASPECT_RATIOS,
    description: "Output aspect ratio (e.g. '1:1', '16:9', '9:16').",
  },
};

/**
 * DALL-E 3 size restrictions.
 */
export const DALLE3_SIZE_OV = {
  size: { validValues: DALLE3_SIZES },
};

/**
 * DALL-E 2 size restrictions.
 */
export const DALLE2_SIZE_OV = {
  size: { validValues: DALLE2_SIZES },
};

/**
 * GPT Image 1 quality options.
 */
export const GPT_IMAGE_QUALITY_OV = {
  quality: { validValues: ["low", "medium", "high", "auto"], default: "auto" },
};

/**
 * Codex quality options.
 */
export const CODEX_QUALITY_OV = {
  quality: { validValues: ["low", "medium", "high", "auto"], default: "auto" },
};

/**
 * DALL-E 3 quality options.
 */
export const DALLE3_QUALITY_OV = {
  quality: { validValues: ["standard", "hd"], default: "standard" },
};

/**
 * n limited to 1 (provider does not support batch generation).
 */
export const N1_OV = {
  n: { max: 1, description: "This model always generates exactly 1 image per request." },
};
