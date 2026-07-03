// Video provider adapter registry
// Add new video providers here following the same pattern as imageProviders/index.js
import leonardoVideo from "./leonardo.js";
import weavyVideo from "./weavy.js";

const ADAPTERS = {
  leonardo: leonardoVideo,
  weavy: weavyVideo,
};

/**
 * Get the video adapter for a given provider ID.
 * @param {string} provider
 * @returns {object|null} adapter with a `generate(credentials, prompt, body, log)` method
 */
export function getVideoAdapter(provider) {
  return ADAPTERS[provider] || null;
}

export function isVideoProvider(provider) {
  return provider in ADAPTERS;
}
