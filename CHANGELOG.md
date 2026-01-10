# Change Log

All notable changes to the "github-copilot-api-vscode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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