import pkg from "../../../package.json" with { type: "json" };

// App configuration
export const APP_CONFIG = {
  name: "9Router Proxy",
  description: "AI Infrastructure Management",
  version: pkg.version,
};

// GitHub configuration
export const GITHUB_CONFIG = {
  changelogUrl: "/CHANGELOG.md",
  donateUrl: "https://9router.com/api/donate",
};

// Updater configuration
export const UPDATER_CONFIG = {
  npmPackageName: "9router",
  installCmd: "npm i -g 9router",
  installCmdLatest: "npm i -g 9router@latest --prefer-online",
  shutdownCountdownSec: 3,
  exitDelayMs: 500,
  statusPort: 20129,
  statusPollIntervalMs: 1000,
  statusLogTailLines: 8,
  installRetries: 3,
  installRetryDelayMs: 5000,
  lingerAfterDoneMs: 30000,
  waitForExitMinMs: 5000,
  waitForExitMaxMs: 20000,
  waitForExitCheckMs: 500,
  appPort: 3001, // fallback; use getServerPort() for actual runtime port
};

/**
 * Get the actual server port at runtime.
 * Reads window.location.port (browser URL = backend port since frontend
 * is served from the same server). Falls back to UPDATER_CONFIG.appPort.
 */
export function getServerPort() {
  if (typeof window !== "undefined" && window.location.port) {
    return Number(window.location.port);
  }
  return UPDATER_CONFIG.appPort;
}

/** Get full base URL of the server e.g. http://localhost:3001 */
export function getServerBaseUrl() {
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${getServerPort()}`;
  }
  return `http://localhost:${UPDATER_CONFIG.appPort}`;
}

// Theme configuration
export const THEME_CONFIG = {
  storageKey: "theme",
  defaultTheme: "system", // "light" | "dark" | "system"
};

// Subscription
export const SUBSCRIPTION_CONFIG = {
  price: 1.0,
  currency: "USD",
  interval: "month",
  planName: "Pro Plan",
};

// API endpoints
export const API_ENDPOINTS = {
  users: "/api/users",
  providers: "/api/providers",
  payments: "/api/payments",
  auth: "/api/auth",
};

export const CONSOLE_LOG_CONFIG = {
  maxLines: 200,
  pollIntervalMs: 1000,
};

// Client-side store TTL: how long fetched data stays fresh before re-fetching
export const CLIENT_STORE_TTL_MS = 60000;

// Provider API endpoints (for display only)
export const PROVIDER_ENDPOINTS = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  glm: "https://api.z.ai/api/anthropic/v1/messages",
  "glm-cn": "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
  kimi: "https://api.kimi.com/coding/v1/messages",
  minimax: "https://api.minimax.io/anthropic/v1/messages",
  "minimax-cn": "https://api.minimaxi.com/anthropic/v1/messages",
  alicode: "https://coding.dashscope.aliyuncs.com/v1/chat/completions",
  "alicode-intl": "https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions",
  "volcengine-ark": "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions",
  byteplus: "https://ark.ap-southeast.bytepluses.com/api/coding/v3/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  "vercel-ai-gateway": "https://ai-gateway.vercel.sh/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models",
  ollama: "https://ollama.com/api/chat",
  "ollama-local": "http://localhost:11434/api/chat",
};

// Re-export from providers.js for backward compatibility
export {
  FREE_PROVIDERS,
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
  AI_PROVIDERS,
  AUTH_METHODS,
} from "./providers.js";

// Re-export from models.js for backward compatibility
export {
  PROVIDER_MODELS,
  AI_MODELS,
} from "./models.js";
