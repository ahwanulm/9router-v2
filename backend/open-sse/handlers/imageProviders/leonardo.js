/**
 * Leonardo AI image and video generation adapter.
 *
 * Providers: leonardo
 * Auth: JWT Bearer token + Sentry trace headers (randomized per request)
 * Format: GraphQL mutation (Generate) → async polling via generationId
 * Polling: Yes — polls /generations/{id} until status == "COMPLETE"
 *
 * Generation paths:
 * - v1 (SDXL-based): phoenix, flux-dev, lucid-origin — uses modelId UUID + contrast/guidance
 * - v2 (native):     seedream, flux-2-pro, gpt-image, sora, veo, kling, etc. — no modelId param
 * - ideogram:        v4/v3 — uses aspectRatio instead of width/height
 *
 * IMPORTANT — params actually forwarded by this adapter:
 * @param {string}  prompt              - (required) Image/video description (max 1400 chars)
 * @param {string}  [model]             - Model alias (e.g. "leo-seedream", "leo-kling-3")
 * @param {number}  [n=1]               - Number of images/clips, capped at 4
 * @param {string}  [size="1024x1024"]  - Output dimensions, used to derive width/height/aspect ratio
 * @param {string}  [negative_prompt]   - Elements to exclude (forwarded directly to Leonardo API)
 *
 * NOTE: For video models (kling, veo, sora, seedance, etc.), the Leonardo GraphQL
 * API itself handles model routing — this adapter sends the same params as for images.
 * duration, resolution, aspect_ratio, image_url, video_url, end_image_url, and
 * motion_strength are NOT currently forwarded by this adapter. They are listed in
 * providerModels.js for future adapter support and UI documentation purposes only.
 */
// Leonardo AI — GraphQL-based image generation adapter
// Uses cookie → JWT auth and Leonardo's native GraphQL API.
// Reference: kliperspro/backend/services/leonardo-service.js
import { sleep, nowSec, POLL_INTERVAL_MS } from "./_base.js";
import { randomBytes } from "crypto";

// Read Leonardo admin config (promptEnhance, capabilities etc.) from KV store.
// Falls back to empty object if DB not available (e.g., first boot).
async function getLeonardoAdminConfig() {
  try {
    const { getAdapter } = await import("../../../src/lib/db/driver.js");
    const db = await getAdapter();
    const row = db.get(`SELECT value FROM kv WHERE scope = 'leonardo' AND key = 'admin_config'`);
    if (!row?.value) return null;
    return typeof row.value === "string" ? JSON.parse(row.value) : row.value;
  } catch {
    return null;
  }
}

let _adminConfigCache = null;
let _adminConfigAt = 0;
const ADMIN_CONFIG_TTL = 30_000; // 30 seconds

async function getModelConfig(modelId) {
  const now = Date.now();
  if (!_adminConfigCache || now - _adminConfigAt > ADMIN_CONFIG_TTL) {
    _adminConfigCache = await getLeonardoAdminConfig();
    _adminConfigAt = now;
  }
  if (!_adminConfigCache?.models) return null;
  const slug = (modelId || "").replace(/^leo-/, "").toLowerCase();
  return _adminConfigCache.models.find(m =>
    (m.id || "").replace(/^leo-/, "").toLowerCase() === slug ||
    (m.apiModelName || "").toLowerCase() === slug
  ) || null;
}

const GRAPHQL_URL = "https://api.leonardo.ai/v1/graphql";
const SENTRY_REL = "6a0bd1b5b7ef23a4f22608a2ed90c5e753cbc669";

const POLL_TIMEOUT_MS = 120_000; // 2 minutes
const POLL_INTERVAL_LEONARDO = 3000; // 3 seconds

// ============================================
// MODEL UUID REGISTRY — mirrors leoapi-main model_id.txt
// ============================================
const MODEL_REGISTRY = {
  // Nano Banana
  "nano-banana-2":    "7418e71f-4133-4e1b-9895-bee19f48f2ce",
  "nano-banana-pro":  "7c02ef35-3a6b-4df6-b78d-873e5032c3b4",
  "nano-banana":      "4a008a65-8d97-44f5-97a0-66c431612614",
  // Seedream
  "seedream-4.5":     "f1c295ea-1575-445f-89ae-9b4013a6a37c",
  "seedream-4":       "94515e81-e589-4a5b-aeae-10ced50142c2",
  "seedream":         "f1c295ea-1575-445f-89ae-9b4013a6a37c",
  // GPT Image
  "gpt-image-2":      "99ecc726-3404-412c-9dc1-24d4cdef2299",
  "gpt-image-1.5":    "99ecc726-3404-412c-9dc1-24d4cdef2299",
  "gpt-image-1":      "f75b1998-e5cb-4fdf-9eef-98e8186c2c2f",
  "gpt-image":        "99ecc726-3404-412c-9dc1-24d4cdef2299",
  // Flux
  "flux-2-pro":       "5478273a-68e1-4efe-a0c4-3fe84e4c16a8",
  "flux-2-dev":       "c19631a4-21b4-4dbd-b015-b446b7a4e0e0",
  "flux-dev":         "b2614463-296c-462a-9586-aafdb8f00e36",
  "flux-schnell":     "1dd50843-d653-4516-a8e3-f0238ee453ff",
  "flux-kontext-max": "02dff998-e678-416c-a8a7-ce93188f2e68",
  "flux-kontext":     "28aeddf8-bd19-4803-80fc-79602d1a9989",
  // Lucid
  "lucid-origin":     "7b592283-e8a7-4c5a-9ba6-d18c31f258b9",
  "lucid-realism":    "05ce0082-2d80-4a2d-8653-4d1c85e2418e",
  // Ideogram (uuid only for v3; v4 = null → native v2)
  "ideogram-3":       "f9672904-3313-4867-b883-407ef6a0edec",
  // Phoenix
  phoenix:            "de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3",
  "phoenix-1.0":      "de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3",
  // XL models
  "kino-xl":          "aa77f04e-3eec-4034-9c07-d0f619684628",
  "anime-xl":         "e71a1c2f-4f80-4800-934f-2c68979d8cc8",
  "lightning-xl":     "b24e16ff-06e3-43eb-8d33-4416c2d75876",
  "vision-xl":        "5c232a9e-9061-4777-980a-ddc8e65647c6",
  "diffusion-xl":     "1e60896f-3c26-4296-8ecc-53e2afecc132",
  // LTX video UUIDs (needed for video adapter if passed as image model by mistake)
  "ltxv-2.3-pro":     "938ebb92-045c-48b5-a02b-9489b4933f60",
  "ltxv-2.3-fast":    "0eba7ca6-57b0-4b9f-9ff3-fd78af067109",
  // Kling video UUIDs
  "kling":            "6c904469-5291-4043-b610-f53b50dfd6ff",
  "kling-omni":       "0d5109cf-d256-4720-86d3-d8e5ff5a3ce2",
  // Note: gemini-image-2, recraft-v4, recraft-v4-pro, ideogram-v4, sora-2,
  // veo-*, hailuo-*, seedance-*, happy-horse all have uuid=null in DEFAULT_CONFIG
  // → they are treated as native v2 models (no modelId in generation params)
};

// ============================================
// DIMENSION TABLES
// ============================================
const STANDARD_SIZES  = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1024, 1024], "4:3": [1440, 1080], "3:4": [1080, 1440], "3:2": [1620, 1080], "2:3": [1080, 1620] };
const SEEDREAM_SIZES  = { "16:9": [2752, 1536], "9:16": [1536, 2752], "1:1": [1536, 1536], "4:3": [2048, 1536], "3:4": [1536, 2048], "3:2": [2048, 1360], "2:3": [1360, 2048] };
const PHOENIX_SIZES   = { "16:9": [2752, 1536], "9:16": [1536, 2752], "1:1": [1536, 1536], "4:3": [2048, 1536], "3:2": [2048, 1360] };
const GPT_IMAGE_SIZES = { "16:9": [1376,  768], "9:16": [ 768, 1376], "1:1": [1024, 1024], "4:3": [1184,  888], "3:4": [ 888, 1184], "3:2": [1248,  832], "2:3": [ 832, 1248] };

// ============================================
// HELPERS
// ============================================

function makeHex(n) { return randomBytes(n).toString("hex"); }

/** Build Sentry trace headers (required by Leonardo API gateway) */
function sentryHeaders(token) {
  const tid = makeHex(8) + makeHex(8);
  return {
    authorization: `Bearer ${token}`,
    "sentry-trace": `${tid}-${makeHex(8).slice(0, 16)}-0`,
    baggage: `sentry-environment=vercel-production,sentry-release=${SENTRY_REL},sentry-public_key=a851bd902378477eae99cf74c62e142a,sentry-trace_id=${tid},sentry-org_id=4504767521292288,sentry-sampled=false`,
  };
}

/** Execute a GraphQL request against Leonardo's API */
async function gql(token, payload) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      origin: "https://app.leonardo.ai",
      referer: "https://app.leonardo.ai/",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "x-leo-schema-version": "latest",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      ...sentryHeaders(token),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Leonardo GraphQL HTTP ${res.status}`);
  return res.json();
}

/** Resolve model UUID from name/id pattern */
function resolveModelUuid(modelId) {
  if (!modelId) return null;
  const input = modelId.trim();

  // Pass-through raw UUIDs
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) {
    return input;
  }

  // Strip 'leo-' prefix
  const name = input.replace(/^leo-/, "").toLowerCase();
  if (MODEL_REGISTRY[name]) return MODEL_REGISTRY[name];
  const normalized = name.replace(/[_.]/g, "-");
  if (MODEL_REGISTRY[normalized]) return MODEL_REGISTRY[normalized];
  for (const [key, uuid] of Object.entries(MODEL_REGISTRY)) {
    if (key.includes(name) || name.includes(key)) return uuid;
  }
  return null;
}

/** Convert OpenAI size string (e.g. "1024x1024") → Leonardo aspect ratio → [width, height] */
function sizeToLeonardoDimensions(size, modelId = "") {
  const sizeMap = {
    "1024x1024": "1:1",
    "1024x1792": "9:16",
    "1792x1024": "16:9",
    "1024x1536": "2:3",
    "1536x1024": "3:2",
  };
  const ar = sizeMap[size] || "1:1";

  const lower = (modelId || "").toLowerCase();
  const isSeedream = lower.includes("seedream");
  const isPhoenix  = lower.includes("phoenix") || lower.includes("nano-banana");
  const isGpt      = lower.includes("gpt-image");

  if (isSeedream  && SEEDREAM_SIZES[ar])  return { ar, dims: SEEDREAM_SIZES[ar] };
  if (isPhoenix   && PHOENIX_SIZES[ar])   return { ar, dims: PHOENIX_SIZES[ar] };
  if (isGpt       && GPT_IMAGE_SIZES[ar]) return { ar, dims: GPT_IMAGE_SIZES[ar] };
  return { ar, dims: STANDARD_SIZES[ar] || [1024, 1024] };
}

/** Derive the API model name sent in the mutation (strip leading 'leo-') */
function resolveApiModelName(modelId) {
  const clean = (modelId || "").replace(/^leo-/, "").toLowerCase();
  const maps = {
    "phoenix": "phoenix-v1.0",
    "seedream": "seedream-4.5",
    "gpt-image": "gpt-image-1.5",
    "ideogram-v4": "ideogram-v4.0",
    "recraft-v4-pro": "recraft-v4",
    "happy-horse": "happy-horse",
    "kling": "kling-2.6",
    "kling-3": "kling-3.0",
    "kling-3-turbo": "kling-3.0-turbo",
    "kling-o1": "kling-video-o-1",
    "kling-o3": "kling-video-o-3",
    "ltx-pro": "ltxv-2.3-pro",
    "ltx-fast": "ltxv-2.3-fast",
    "ltx-2-pro": "ltxv-2.3-pro",
    "ltx-2-fast": "ltxv-2.3-fast",
  };
  return maps[clean] || clean;
}

/**
 * Returns the generation API version for a model:
 *  - "v1" → legacy SDXL path: num_images + modelId UUID + contrast (Phoenix, Flux Dev, Lucid Origin)
 *  - "v2" → native path: quantity, no modelId (Seedream, GPT Image, Flux 2 Pro, etc.)
 */
function getModelApiVersion(modelId) {
  const name = (modelId || "").toLowerCase();
  const isV1 = (
    name === "leo-flux-dev" || name === "flux-dev" ||
    name.includes("lucid-origin")
  );
  return isV1 ? "v1" : "v2";
}

// ============================================
// POLLING
// ============================================

async function pollGenerationStatus(token, genId) {
  const query = {
    operationName: "GetAIGenerationFeedStatuses",
    variables: { where: { id: { _eq: genId } } },
    query: `query GetAIGenerationFeedStatuses($where: generations_bool_exp = {}) {
  generations(where: $where) { id status __typename }
}`,
  };
  const rj = await gql(token, query);
  const gen = (rj?.data?.generations || [])[0];
  return gen?.status || "PENDING";
}

async function fetchGeneratedImageUrls(token, genId) {
  const query = {
    operationName: "GetAIGenerationFeed",
    variables: { where: { id: { _eq: genId } }, limit: 4 },
    query: `query GetAIGenerationFeed($where: generations_bool_exp = {}, $limit: Int) {
  generations(where: $where, limit: $limit) {
    generated_images(order_by: [{url: desc}]) { url id __typename }
    __typename
  }
}`,
  };
  const rj = await gql(token, query);
  const gen = (rj?.data?.generations || [])[0];
  return (gen?.generated_images || []).map((img) => img.url).filter(Boolean);
}

async function waitForImages(token, genId, timeoutMs = POLL_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_LEONARDO);
    const status = await pollGenerationStatus(token, genId);
    if (status === "COMPLETE" || status === "COMPLETED") {
      return await fetchGeneratedImageUrls(token, genId);
    }
    if (status === "FAILED" || status === "ERROR") {
      throw new Error(`Leonardo generation failed (status=${status})`);
    }
  }
  // Timeout — try one last fetch
  try {
    const urls = await fetchGeneratedImageUrls(token, genId);
    if (urls.length) return urls;
  } catch {}
  throw new Error("Leonardo generation timed out");
}

// ============================================
// ADAPTER
// ============================================

export default {
  /** Credentials stored as cookie (apiKey) + resolved JWT (accessToken) */
  buildUrl: (_model, _creds) => GRAPHQL_URL,

  buildHeaders: (creds) => {
    const token = creds?.accessToken || creds?.apiKey || "";
    return {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      origin: "https://app.leonardo.ai",
      referer: "https://app.leonardo.ai/",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "x-leo-schema-version": "latest",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      ...sentryHeaders(token),
    };
  },

  buildBody: async (modelId, body) => {
    const n = Math.min(body.n || 1, 4);
    const { ar, dims } = sizeToLeonardoDimensions(body.size, modelId);
    const [width, height] = dims;
    const prompt = (body.prompt || "").slice(0, 1400);
    const modelCfg = await getModelConfig(modelId);
    const apiModelName = modelCfg?.apiModelName || resolveApiModelName(modelId);
    const modelUuid = resolveModelUuid(modelId);
    const apiVersion = getModelApiVersion(modelId);
    const promptEnhance = body.prompt_enhance ?? (modelCfg?.promptEnhance || "OFF");

    let params;

    if (apiVersion === "v1") {
      // ── v1 legacy path (Phoenix, Flux Dev, Lucid Origin) ──
      // Requires: num_images, modelId UUID, contrast
      params = {
        width,
        height,
        prompt,
        num_images: n,
        modelId: modelUuid,
        prompt_enhance: promptEnhance,
        contrast: body.contrast ?? 3.5,  // required for Phoenix/Lucid
      };
      if (body.guidance_scale != null) params.guidance_scale = body.guidance_scale;
      if (body.num_inference_steps != null) params.num_inference_steps = body.num_inference_steps;
    } else {
      // ── v2 native path (Seedream, GPT Image, Flux 2 Pro, etc.) ──
      params = {
        prompt,
        quantity: n,
        prompt_enhance: promptEnhance,
      };
      if (apiModelName.toLowerCase().includes("ideogram")) {
        params.aspectRatio = ar;
      } else {
        params.width = width;
        params.height = height;
      }
      if (modelCfg?.quality) params.quality = modelCfg.quality;
    }

    if (body.negative_prompt) params.negative_prompt = body.negative_prompt;

    return {
      operationName: "Generate",
      variables: {
        request: {
          model: apiModelName,
          public: body.is_public ?? false,
          parameters: params,
        },
      },
      query: `mutation Generate($request: CreateGenerationRequest!) {
  generate(request: $request) {
    apiCreditCost generationId __typename
  }
}`,
    };
  },

  /**
   * Overrides standard parse flow — after submitting the mutation we need to
   * poll until the generation completes, then return OpenAI-format image URLs.
   *
   * The imageGenerationCore passes:
   *   { headers, log, streamToClient, onRequestSuccess, url, requestBody, model, body }
   * `headers` is the request headers object (plain dict) containing `authorization`.
   */
  async parseResponse(response, { headers, log }) {
    const rj = await response.json();

    // Propagate GraphQL errors
    if (rj?.errors?.length) {
      const msg = rj.errors.map((e) => e.message).join(" | ");
      throw new Error(`Leonardo generate error: ${msg}`);
    }

    const genId = rj?.data?.generate?.generationId;
    if (!genId) {
      throw new Error(`Leonardo: no generationId in response: ${JSON.stringify(rj).slice(0, 300)}`);
    }

    log?.debug?.("LEONARDO", `Generation submitted genId=${genId}`);

    // Extract the Bearer JWT from the request Authorization header
    const authHeader = (headers?.authorization || headers?.Authorization || "");
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      throw new Error("Leonardo: no JWT token found in request headers");
    }

    const urls = await waitForImages(token, genId);
    log?.debug?.("LEONARDO", `Generation complete — ${urls.length} image(s) fetched`);

    // Return in OpenAI image-response format
    return {
      created: nowSec(),
      data: urls.map((url) => ({ url })),
    };
  },

  normalize: (parsed) => {
    // Already normalized by parseResponse above
    if (parsed?.created && Array.isArray(parsed?.data)) return parsed;
    const urls = Array.isArray(parsed?.data) ? parsed.data : [];
    return { created: nowSec(), data: urls };
  },
};
