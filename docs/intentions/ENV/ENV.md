---
tags:
  - roadmap
---
# ENV – Central API Keys & Environment Management

## Intention

The project should reuse API keys from a central location (e.g. \C:\Files\.env\) instead of duplicating them locally in \C:\chess-repertoire\.env\.

This approach keeps sensitive tokens (such as \LICHESS_API_TOKEN\, \GEMINI_API_KEY\, \ELEVENLABS_API_KEY\) consolidated in one place on the host machine. By maintaining a single source of truth for credentials, it prevents accidental commits of API keys and avoids having to update keys in multiple project directories when they rotate or expire.

Additionally, requests to Google Gemini and ElevenLabs APIs are routed through a local proxy server running on the host machine (\http://127.0.0.1:55555\), which reads these central keys and securely injects them into outbound HTTP requests via headers or query parameters, completely separating secret management from the application code.

### Implementation Checklist
- [x] Configure generator scripts (\start_tree_generator.ts\) to load \dotenv\ from \C:\Files\.env\ globally.
- [x] Use \process.env.LICHESS_API_TOKEN\ dynamically when querying the Lichess Masters Explorer (handled via \etry.ts\ HTTP headers).
- [ ] Make all application processes (web server, scripts) automatically fall back to \C:\Files\.env\ when local keys are not found.
