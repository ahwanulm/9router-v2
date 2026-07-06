# 9Router v2 Changelog

All notable changes to the decoupled **9Router v2** platform will be documented here.

---

## [v0.5.0] - 2026-07-06

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
