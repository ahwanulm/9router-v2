// Leonardo AI — GraphQL-based video generation adapter
// Mirrors the video generation pipeline in kliperspro/backend/services/leonardo-service.js
// Supports: Kling 3.x, LTX 2.3, Motion models
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getModelsByProviderId } from "../../config/providerModels.js";

const GRAPHQL_URL = "https://api.leonardo.ai/v1/graphql";
const SENTRY_REL = "6a0bd1b5b7ef23a4f22608a2ed90c5e753cbc669";

const POLL_TIMEOUT_MS = 600_000;   // 10 minutes for video
const POLL_INTERVAL_MS = 5_000;    // poll every 5s

// ============================================
// VIDEO_MODEL_NAMES: model slug (after stripping 'leo-') → exact apiModelName for Leonardo API
// Source: kliperspro DEFAULT_CONFIG apiModelName fields (verified via web app network capture)
const VIDEO_MODEL_NAMES = {
  // Kling
  "kling":               "kling-2.6",
  "kling-3":             "kling-3.0",
  "kling-3.0":           "kling-3.0",
  "kling-3-turbo":       "kling-3.0-turbo",
  "kling-3.0-turbo":     "kling-3.0-turbo",
  "kling-o1":            "kling-video-o-1",
  "kling-o3":            "kling-video-o-3",
  "kling-video-o-1":     "kling-video-o-1",
  "kling-video-o-3":     "kling-video-o-3",
  "kling-2.5-turbo":     "kling-2.5-turbo-standard",
  // Grok Imagine
  "grok-imagine-1.5":    "grok-imagine-1.5",
  // Seedance
  "seedance":            "seedance-1.0-pro",
  "seedance-1.0-pro":    "seedance-1.0-pro",
  "seedance-pro-fast":   "seedance-1.0-pro-fast",
  "seedance-1.0-pro-fast": "seedance-1.0-pro-fast",
  "seedance-2":          "seedance-2.0",
  "seedance-2.0":        "seedance-2.0",
  "seedance-2-pro":      "seedance-2.0-pro",
  "seedance-2.0-pro":    "seedance-2.0-pro",
  "seedance-2-fast":     "seedance-2.0-fast",
  "seedance-2.0-fast":   "seedance-2.0-fast",
  // Sora
  "sora":                "sora-2",
  "sora-2":              "sora-2",
  "sora-2-pro":          "sora-2-pro",
  // Veo
  "veo":                 "veo-3.0-generate-001",
  "veo-fast":            "veo-3.0-fast-generate-001",
  "veo-3.0":             "veo-3.0-generate-001",
  "veo-3.0-generate-001":"veo-3.0-generate-001",
  "veo-3.1":             "veo-3.1-generate-001",
  "veo-3.1-generate-001":"veo-3.1-generate-001",
  "veo-3.1-fast":        "veo-3.1-fast-generate-001",
  "veo-3.1-lite":        "veo-3.1-lite",
  // Hailuo
  "hailuo":              "hailuo-2_3",
  "hailuo-2.3":          "hailuo-2_3",
  "hailuo-fast":         "hailuo-2_3-fast",
  "hailuo-2.3-fast":     "hailuo-2_3-fast",
  // LTX
  "ltx-pro":             "ltxv-2.3-pro",
  "ltx-fast":            "ltxv-2.3-fast",
  "ltx-2.3-pro":         "ltxv-2.3-pro",
  "ltx-2.3-fast":        "ltxv-2.3-fast",
  "ltxv-2.3-pro":        "ltxv-2.3-pro",
  "ltxv-2.3-fast":       "ltxv-2.3-fast",
  // Motion
  "motion":              "motion_2.0",
  "motion-fast":         "motion_2.0-fast",
  "motion_2.0":          "motion_2.0",
  "motion_2.0-fast":     "motion_2.0-fast",
  // Happy Horse
  "happy-horse":         "happy-horse",
};

// ============================================
// DIMENSION TABLE FOR VIDEO
// ============================================
// [width, height] per resolution tier per aspect ratio
const VIDEO_DIMENSIONS = {
  "16:9": { 480: [832, 480],   720: [1280, 720],  1080: [1920, 1080] },
  "9:16": { 480: [480, 832],   720: [720, 1280],  1080: [1080, 1920] },
  "1:1":  { 480: [480, 480],   720: [720, 720],   1080: [1080, 1080] },
};

// ============================================
// HELPERS
// ============================================

function makeHex(n) { return randomBytes(n).toString("hex"); }

function sentryHeaders(token) {
  const tid = makeHex(8) + makeHex(8);
  return {
    authorization: `Bearer ${token}`,
    "sentry-trace": `${tid}-${makeHex(8).slice(0, 16)}-0`,
    baggage: `sentry-environment=vercel-production,sentry-release=${SENTRY_REL},sentry-public_key=a851bd902378477eae99cf74c62e142a,sentry-trace_id=${tid},sentry-org_id=4504767521292288,sentry-sampled=false`,
  };
}

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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Resolve model slug from leo- prefixed model id */
function resolveApiModelName(modelId) {
  const name = (modelId || "").replace(/^leo-/, "").toLowerCase();
  return VIDEO_MODEL_NAMES[name] || name;
}

/** Map OpenAI size string to [width, height] for video */
function sizeToVideoDimensions(size, resolution = 720, aspectRatioHint) {
  const sizeMap = {
    "1024x1024": "1:1",
    "1024x1792": "9:16",
    "1792x1024": "16:9",
    "1024x1536": "9:16",
    "1536x1024": "16:9",
  };
  const ar = aspectRatioHint || sizeMap[size] || "16:9";
  const resTier = resolution >= 1080 ? 1080 : resolution >= 720 ? 720 : 480;
  const arDims = VIDEO_DIMENSIONS[ar] || VIDEO_DIMENSIONS["16:9"];
  return { ar, dims: arDims[resTier] || arDims[720] };
}

/** Determine resolution mode string from resolution integer */
function resolutionMode(res) {
  if (res >= 1080) return "RESOLUTION_1080";
  if (res >= 720)  return "RESOLUTION_720";
  return "RESOLUTION_480";
}

/** Build the Generate mutation payload for video models */
async function uploadToLeonardo(token, fileUrl, fileType = "image", log) {
  if (!fileUrl) return null;
  log?.debug?.("LEONARDO_UPLOAD", `fetching ${fileType} from ${fileUrl}`);

  let fileBuffer;
  let ext = "";

  if (fileUrl.startsWith("data:")) {
    const fileRes = await fetch(fileUrl);
    fileBuffer = await fileRes.arrayBuffer();
    const mime = fileUrl.split(";")[0].split(":")[1] || "";
    ext = mime.split("/")[1] || (fileType === "video" ? "mp4" : "png");
  } else if (/^https?:\/\//i.test(fileUrl)) {
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      throw new Error(`Failed to fetch reference file: HTTP ${fileRes.status}`);
    }
    fileBuffer = await fileRes.arrayBuffer();
    const urlPath = new URL(fileUrl).pathname;
    ext = urlPath.substring(urlPath.lastIndexOf('.') + 1).toLowerCase();
  } else {
    // Local file path or relative path (e.g. /uploads/file.png)
    let resolvedPath = fileUrl;
    if (fileUrl.startsWith("/")) {
      const publicPath = path.join(process.cwd(), "public", fileUrl);
      const rootPath = path.join(process.cwd(), fileUrl);
      try {
        await fs.access(publicPath);
        resolvedPath = publicPath;
      } catch {
        try {
          await fs.access(rootPath);
          resolvedPath = rootPath;
        } catch {
          throw new Error(`Local file not found: ${fileUrl}`);
        }
      }
    }
    fileBuffer = await fs.readFile(resolvedPath);
    ext = path.extname(resolvedPath).slice(1).toLowerCase();
  }

  const gqlExt = ext === "jpeg" ? "jpg" : ext;

  log?.debug?.("LEONARDO_UPLOAD", `getting presigned url for ${gqlExt}`);

  const uploadQuery = {
    operationName: "UploadImage",
    variables: {
      uploadImageInput: {
        uploadType: "INIT",
        extension: gqlExt,
      },
    },
    query: `mutation UploadImage($uploadImageInput: UploadImageInput!) {
      uploadImage(arg1: $uploadImageInput) {
        uploadId url fields __typename
      }
    }`,
  };

  const gqlRes = await gql(token, uploadQuery);
  const uploadInfo = gqlRes?.data?.uploadImage;
  if (!uploadInfo) {
    throw new Error(`Failed to get presigned upload URL: ${JSON.stringify(gqlRes)}`);
  }

  const { uploadId, url, fields: fieldsStr } = uploadInfo;
  log?.debug?.("LEONARDO_UPLOAD", `uploading to S3, uploadId=${uploadId}`);

  const fields = JSON.parse(fieldsStr || "{}");
  const formData = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    formData.append(k, v);
  }
  formData.append("file", new Blob([fileBuffer]), `file.${ext}`);

  const s3Res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!s3Res.ok) {
    const errText = await s3Res.text();
    throw new Error(`S3 upload failed: HTTP ${s3Res.status} - ${errText}`);
  }

  log?.debug?.("LEONARDO_UPLOAD", `S3 upload completed, polling moderation...`);

  // Poll moderation to get the final initImageId
  const modQuery = {
    operationName: "GetInitImageModeration",
    variables: { akUUID: uploadId },
    query: `query GetInitImageModeration($akUUID: uuid!) {
      init_image_moderation(where: {akUUID: {_eq: $akUUID}}) {
        akUUID initImageId checkStatus __typename
      }
    }`,
  };

  let initImageId = null;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const rj = await gql(token, modQuery);
    const records = rj?.data?.init_image_moderation || [];
    if (records.length > 0) {
      const record = records[0];
      const status = record.checkStatus;
      log?.debug?.("LEONARDO_UPLOAD", `poll #${i+1}: status=${status}`);
      if (status === "Accepted") {
        initImageId = record.initImageId;
        break;
      } else if (status === "Rejected") {
        throw new Error("Reference file rejected by Leonardo moderation");
      }
    } else {
      log?.debug?.("LEONARDO_UPLOAD", `poll #${i+1}: no moderation records yet`);
    }
  }

  if (!initImageId) {
    throw new Error("Failed to get initImageId: moderation check timed out");
  }

  return initImageId;
}

function buildVideoMutation(apiModelName, prompt, { width, height, mode, duration, motionAudio, initImageId, initVideoId, motionStrength }) {
  const params = {
    height,
    width,
    duration,
    quantity: 1,
    prompt: prompt.trim().slice(0, 950),
  };

  const lowerModel = apiModelName.toLowerCase();
  if (!lowerModel.includes("ltx") && !lowerModel.includes("ltxv")) {
    params.mode = mode;
  }

  // Motion audio support for Kling and LTX
  if (motionAudio) params.motion_has_audio = true;

  if (motionStrength !== undefined) params.motionStrength = motionStrength;

  // Build guidances mapping for image and video references per Leonardo AI GraphQL requirements
  const guidances = {};
  const isMotion = lowerModel.includes("motion");

  if (initImageId) {
    if (isMotion) {
      guidances.image_reference = [
        {
          image: { id: initImageId, type: "UPLOADED" },
          strength: "MID",
        },
      ];
    } else {
      guidances.start_frame = [
        { image: { id: initImageId, type: "UPLOADED" } }
      ];
    }
  }

  if (initVideoId) {
    guidances.video_reference_base = [
      { video: { id: initVideoId, type: "UPLOADED" } }
    ];
  }

  if (Object.keys(guidances).length > 0) {
    params.guidances = guidances;
    // Disable prompt enhance if using reference files
    params.prompt_enhance = "OFF";
  }

  return {
    operationName: "Generate",
    variables: {
      request: {
        model: apiModelName,
        public: false,
        parameters: params,
      },
    },
    query: `mutation Generate($request: CreateGenerationRequest!) {
  generate(request: $request) {
    apiCreditCost generationId __typename
  }
}`,
  };
}

// ============================================
// POLLING
// ============================================

async function pollStatus(token, genId) {
  const query = {
    operationName: "GetAIGenerationFeedStatuses",
    variables: { where: { id: { _eq: genId } } },
    query: `query GetAIGenerationFeedStatuses($where: generations_bool_exp = {}) {
  generations(where: $where) { id status __typename }
}`,
  };
  const rj = await gql(token, query);
  return (rj?.data?.generations || [])[0]?.status || "PENDING";
}

async function fetchVideoUrls(token, genId) {
  const query = {
    operationName: "GetAIGenerationFeed",
    variables: { where: { id: { _eq: genId } }, limit: 1 },
    query: `query GetAIGenerationFeed($where: generations_bool_exp = {}, $limit: Int) {
  generations(where: $where, limit: $limit) {
    generated_images(order_by: [{url: desc}]) {
      url id motionMP4URL __typename
    }
    __typename
  }
}`,
  };
  const rj = await gql(token, query);
  const gen = (rj?.data?.generations || [])[0];
  const images = gen?.generated_images || [];
  return images.map((img) => img.motionMP4URL || img.url).filter(Boolean);
}

async function waitForVideo(token, genId, timeoutMs = POLL_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let polls = 0;
  while (Date.now() < deadline) {
    polls++;
    await sleep(POLL_INTERVAL_MS);
    const status = await pollStatus(token, genId);
    if (status === "COMPLETE" || status === "COMPLETED") {
      const urls = await fetchVideoUrls(token, genId);
      return urls;
    }
    if (status === "FAILED" || status === "ERROR") {
      throw new Error(`Leonardo video generation failed after ${polls} polls`);
    }
  }
  // Timeout — try one last fetch
  try {
    const urls = await fetchVideoUrls(token, genId);
    if (urls.length) return urls;
  } catch {}
  throw new Error("Leonardo video generation timed out");
}

// ============================================
// ADAPTER EXPORT
// ============================================

export default {
  /**
   * Generate a video via Leonardo AI's GraphQL API.
   * Called by the videoGenerationCore orchestrator.
   *
   * @param {object} credentials - { accessToken, apiKey } (JWT in accessToken)
   * @param {string} prompt
   * @param {object} body - OpenAI-compatible request body { model, size, duration, ... }
   * @param {object} [log]
   * @returns {Promise<{ urls: string[], genId: string }>}
   */
  async generate(credentials, prompt, body, log) {
    const token = credentials?.accessToken || credentials?.apiKey || "";
    if (!token) throw new Error("Leonardo: missing JWT token (accessToken)");

    const modelId = body.model || "leo-kling-3.0";
    const apiModelName = resolveApiModelName(modelId);

    // Model capability checks
    const models = getModelsByProviderId("leonardo");
    const modelDef = models.find((m) => m.id === modelId);
    if (modelDef) {
      const supportedParams = modelDef.params || [];
      if (body.image_url && !supportedParams.includes("image_url")) {
        throw new Error(`Model '${modelId}' does not support image reference`);
      }
      if (body.video_url && !supportedParams.includes("video_url")) {
        throw new Error(`Model '${modelId}' does not support video reference`);
      }
    }

    const resolution = parseInt(body.resolution) || 720;
    const { ar, dims } = sizeToVideoDimensions(body.size, resolution, body.aspect_ratio);
    const [width, height] = dims;
    const mode = resolutionMode(resolution);

    // Duration: default 5s for video, max 10s
    let duration = Math.min(parseInt(body.duration) || 5, 10);
    const lower = apiModelName.toLowerCase();
    if (lower.includes("veo") || lower.includes("ltx") || lower.includes("ltxv")) {
      duration = Math.max(duration, 6);
    }

    // Audio generation support (Kling, LTX)
    const motionAudio = lower.includes("kling") || lower.includes("ltx");

    // Upload reference files if provided
    let initImageId = null;
    if (body.image_url) {
      try {
        initImageId = await uploadToLeonardo(token, body.image_url, "image", log);
      } catch (uploadErr) {
        log?.error?.("LEONARDO_VIDEO", `Image upload failed: ${uploadErr.message}`);
        throw new Error(`Failed to upload reference image: ${uploadErr.message}`);
      }
    }

    let initVideoId = null;
    if (body.video_url) {
      try {
        initVideoId = await uploadToLeonardo(token, body.video_url, "video", log);
      } catch (uploadErr) {
        log?.error?.("LEONARDO_VIDEO", `Video upload failed: ${uploadErr.message}`);
        throw new Error(`Failed to upload reference video: ${uploadErr.message}`);
      }
    }

    const motionStrength = body.motion_strength !== undefined ? parseInt(body.motion_strength) : undefined;

    log?.debug?.("LEONARDO_VIDEO", `model=${apiModelName} ${width}x${height} ${mode} dur=${duration}s imageRef=${initImageId || "none"} videoRef=${initVideoId || "none"} motionStrength=${motionStrength ?? "default"}`);

    const mutation = buildVideoMutation(apiModelName, prompt, {
      width,
      height,
      mode,
      duration,
      motionAudio,
      initImageId,
      initVideoId,
      motionStrength
    });

    const rj = await gql(token, mutation);

    if (rj?.errors?.length) {
      const msg = rj.errors.map((e) => e.message).join(" | ");
      throw new Error(`Leonardo video generate error: ${msg}`);
    }

    const genId = rj?.data?.generate?.generationId;
    if (!genId) {
      throw new Error(`Leonardo video: no generationId in response: ${JSON.stringify(rj).slice(0, 200)}`);
    }

    log?.debug?.("LEONARDO_VIDEO", `submitted genId=${genId}, polling...`);
    const urls = await waitForVideo(token, genId);
    log?.debug?.("LEONARDO_VIDEO", `complete — ${urls.length} video(s)`);

    return { urls, genId };
  },
};
