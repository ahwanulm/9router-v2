# 9Router v2 Changelog

All notable changes to the decoupled **9Router v2** platform will be documented here.

---

## [v0.6.3] - 2026-07-08

### Fixed
- **Claude Code double `/v1` in URL**: CLI Tools claude-settings route was incorrectly appending `/v1` to `ANTHROPIC_BASE_URL`. Since Claude Code's SDK already appends `/v1/messages` automatically, requests were hitting `/v1/v1/messages` (404). The route now strips any trailing `/v1` from the URL instead of adding it.
- **Claude Code `model output must contain either output text or tool calls` error**: When models (e.g. GLM, DeepSeek) return only a thinking block with empty text, the openai-to-claude translator now injects a minimal text block to satisfy Claude Code's requirement.
- **AMRouter port detection in CLI Tools**: Claude-settings route now detects AMRouter on its default port `5177` (in addition to legacy 9Router port `3001`).
- **Duplicate entries in Recent Requests/Usage**: Streaming requests were being logged twice — once as a placeholder (`ttft=0, "[Streaming in progress...]"`) when the stream started, and again when it completed. The placeholder write has been removed; only the final completion record is now saved, resulting in one clean entry per request.
- **Cloudflare 400 error with tool_result in multi-turn tool use**: The Claude→OpenAI request translator was not handling `thinking` and `redacted_thinking` blocks in assistant messages. When Claude Code sent a multi-turn conversation with thinking blocks, these unhandled blocks caused the translator to produce an empty/null message — de-syncing the message array index and leaving `tool_result` blocks unconverted in user messages. Fixed by: (1) converting `thinking` blocks to text parts, (2) silently dropping `redacted_thinking` blocks, (3) adding a `default` case to preserve message ordering, and (4) always returning a non-null message from array content.



---

## [v0.6.2] - 2026-07-08


### Changed
- **Rebranding — AMRouter**: Sidebar, login page, favicon, and browser tab title updated from "9Router v2" to "AMRouter" to match the renamed GitHub repository.
- **New Logo**: App icon updated with a new AMRouter logo (orange circuit-board "AM" motif on dark background).

---

## [v0.6.1] - 2026-07-08

### Fixed
- **Icons not rendering (showing as text)**: Material Symbols Outlined font is now bundled locally via the `material-symbols` npm package instead of being loaded from Google Fonts CDN. Fixes icons appearing as raw text strings (e.g. `content_copy`, `vpn_key`, `bolt`) in environments without internet access or with blocked CDN requests.

---

## [v0.6.0] - 2026-07-06

### Added
- **Usage API — Complete Provider Coverage**: Fully implemented usage/quota fetching for all supported providers:
  - **GitHub Copilot**: Real quota snapshots (paid plan: chat/completions/premium; free plan: monthly limits + reset date)
  - **Gemini CLI**: Per-model quota buckets via `cloudcode-pa.googleapis.com` with remaining fraction + reset time
  - **Antigravity**: Model-level quota from `fetchAvailableModels` with subscription tier info
  - **Claude**: OAuth usage endpoint (5h session + 7d weekly windows) with legacy org fallback
  - **Codex (OpenAI)**: `chatgpt.com/backend-api/wham/usage` session + weekly rate limit windows
  - **Kiro (AWS)**: `codewhisperer.us-east-1.amazonaws.com/getUsageLimits` multi-endpoint fallback
  - **Qoder**: `openapi.qoder.sh/api/v2/quota/usage` with expiry parsing
  - **GLM / GLM-CN**: `bigmodel.cn/api/monitor/usage/quota/limit` per-region with plan level
  - **MiniMax / MiniMax-CN**: `coding_plan/remains` multi-URL fallback + M-series percent-only buckets
  - **CodeBuddy**: `billing/ide/usage` with local DB fallback for `ck_` API keys (Tencent restriction)
  - **Kimi Coding**: User profile endpoint for connection status
  - **Cloudflare Workers AI**: `api.cloudflare.com/accounts/{id}/ai/usage` neurons + requests
  - **Cursor**: `api2.cursor.sh/auth/stripe` membership type + expiry info
  - **KiloCode**: `api.kilo.ai/api/user/profile` plan + credits
  - **Cline**: `api.cline.bot/api/v1/auth/me` plan + credits

- **Skills Page Improvements**:
  - Skills now point to `ahwanulm/AMRouter` repo (previously `decolua/9router`)
  - Added `using-superpowers` and `multi-brain` agent skills
  - Page redesigned with 3 sections: Entry Point / API Capabilities / Agent Workflow
  - Quick Start card with copy-prompt button

- **Agent Instructions** (`.agents/AGENTS.md`): Workspace rule requiring changelog updates after every significant change

### Changed
- **Donate link**: Changed from modal to direct external link → `https://mayar.to/ahwanulm`
- **Language picker removed**: Dashboard now defaults to English; language selection UI removed from header and profile page
- **Changelog**: Now served from local `/CHANGELOG.md` static file, no longer fetched from upstream 9router repo

### Removed
- **Weavy AI provider**: Removed from `WEB_COOKIE_PROVIDERS` — automation scripts deleted
- **Weavy AI usage**: Removed from `USAGE_SUPPORTED_PROVIDERS`
- **Leonardo AI usage**: Removed from `USAGE_SUPPORTED_PROVIDERS` (provider kept as deprecated)
- **Cookie Pool tab**: Removed from Automation page

---

## [v0.5.0] - 2026-07-04

### Added
- **OIDC Authentication Support**: Added full support for OpenID Connect (Single Sign-On) and custom OIDC callback workflows.
- **Brand New Sign-in Experience**: A premium, highly aesthetic dark-mode login interface with dynamic card effects, user reviews, and instant authentication options.
- **Cloudflare Workers AI Automation**:
  - Fully automated credentials flow using turnstile resolver (Playwright & 2Captcha).
  - Automatically fetches the API keys and Account ID, configuring the connection to 9router instantly.
  - Integrates seamlessly with the **Ammail** temporary mail API to handle real-time verification codes.
- **Embedded API Documentation**: Included local static reference docs for image and video APIs.

### Changed
- **Streamlined Dashboard**: Removed Leonardo AI, Weavy AI, Kimi, Qoder, and Cookie Pool tabs to focus entirely on Cloudflare Workers AI automation.
- **Improved Log View**: Fixed log directory creation and redirected auth logout flows to prevent infinity page routing loops.
- **Portability**: Transitioned backend configuration to run portably on all desktop and server environments.
