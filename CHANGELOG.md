# Change Log

All notable changes to the "github-copilot-api-vscode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [2.9.0] - 2026-02-20

### Added
- **Modern Dashboard UI:** Complete visual overhaul with glassmorphism-inspired cards, refined color palettes adapting to VS Code themes, and smooth interactive hover effects.
- **Multi-Model Support Badge:** Highlighted capability in the dashboard hero section noting the Gateway can fetch ANY language model detected in VS Code.
- **Wiki Refinements:** Redesigned documentation tabs to a modern pill-shaped style and improved code block typography.

### Fixed
- **Live Feed & Activities:** Resolved JavaScript reference errors that broke the real-time Live Log and Recent Activity features.
- **Cloudflare Tunnel Status:** Fixed a bug where starting a tunnel displayed the literal string "null" instead of a proper "Starting" state in the dashboard.

## [2.7.0] - 2026-02-15

### Added
- **Status Bar:** Shows active model name, uptime counter, tunnel indicator (🌐), and enriched tooltip with full metrics table
- **Quick Pick Menu:** Copy API URL, Quick Test (sends live "Hello" request), Switch Model (lists all Copilot models), Edit System Prompt, Start/Manage Tunnel
- **Sidebar:** Animated pulsing status dot, clickable model name for switching, live uptime ticker (ticks every second), 4-stat grid (RPM, latency, total reqs, error rate), live request feed with flash animation, config status indicators (Auth/HTTPS/Tunnel)
- **README:** "Run as a Background Service" guide for macOS, Windows, and Linux

### Changed
- Sidebar layout reorganized: stats and live feed now above action buttons for better at-a-glance monitoring
- Removed duplicate Swagger button event listener from sidebar

## [2.6.0] - 2026-02-13

### Added
- **OpenAI Chat Completions:** `max_completion_tokens` parameter support (auto-normalized to `max_tokens` for GPT-5.x compatibility)
- **OpenAI Chat Completions:** `developer` role support (auto-mapped to `system` for 2025+ spec)
- **OpenAI Chat Completions:** `stream_options.include_usage` — emit usage chunk in streaming responses
- **OpenAI Chat Completions:** `reasoning_effort` parameter support for o-series models (auto-mapped to `reasoning.effort`)
- **OpenAI Responses API:** `text.format` structured output pass-through (was hardcoded to `text`)
- **OpenAI Responses API:** `truncation` parameter pass-through
- **OpenAI Responses API:** Expanded `reasoning.effort` values — added `minimal`, `none`, `xhigh` (Aug–Dec 2025 spec)
- **OpenAI Responses API:** Streaming events now pass through `text.format` and `truncation` from request
- **Anthropic Messages API:** `thinking`, `metadata` interface fields; `tool_use` stop reason; cache token usage
- **Google Generative AI:** `frequencyPenalty`, `presencePenalty`, `responseMimeType`, `responseSchema`, `safetySettings` interface
- **OpenAPI Spec:** Added `max_completion_tokens`, `reasoning_effort` to Chat Completions schema
- **OpenAPI Spec:** Added `developer` to Message role enum
- **OpenAPI Spec:** Added `reasoning`, `truncation`, `store`, `previous_response_id`, `tool_choice` to Responses API schema

### Changed
- Updated branding to emphasize free, open-source, and trustworthy nature
- Upgraded TypeScript to 5.9.3, typescript-eslint to 8.55.0, @types/node to 25.2.3

## [2.5.1] - 2026-02-07

### Fixed
- **Cloudflare Tunnel binary:** Now downloads the cloudflared binary automatically at runtime to extension storage. Works properly for marketplace-installed extensions.

## [2.5.0] - 2026-02-07

### Added
- **🌐 Internet Access via Cloudflare Tunnels:** Expose your API to the internet with a single click. Get a free public `*.trycloudflare.com` URL instantly — no account required. Perfect for accessing from your phone, sharing with friends, or remote development.
- **Network Access Guide:** New "What's New" banner explaining the difference between localhost (127.0.0.1), LAN (0.0.0.0), and Cloudflare Tunnel access.
- **Security Enforcement:** Tunnel requires API key authentication to be enabled before going live.

### Changed
- Dashboard UI improvements with better feature discovery.

## [2.1.5] - 2026-01-11

### Fixed
- **Real-time metrics:** Sidebar and dashboard now update metrics (Req/Min, Latency, Tokens, Connections) in real-time
- **Dashboard race condition:** Fixed message listener timing issue that caused stale data on initial load
- **Host/Port layout:** Fixed overlap between host, port inputs and Apply button

### Added
- "Things you should read" button in sidebar linking to notes.suhaib.in

## [2.1.4] - 2026-01-10

### Fixed
- **Model Selection:** Fixed critical issue where API endpoints were ignoring the requested model and defaulting to the first available model. Now all endpoints strictly validate and use the exact model specified in the request.
- Added model validation across all API endpoints (OpenAI, Anthropic, Google, Llama). Invalid models now return a 404 error with a list of available models.

### Changed
- Updated README to be model-agnostic and expanded tool categories.
- Removed specific model name references to future-proof documentation.

## [0.0.7] - 2025-12-21

### Fixed
- Dashboard readability issues in Light and High Contrast themes by using VS Code theme variables.

## [0.0.6]

- Initial release