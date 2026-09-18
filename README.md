# EchoCraft - Voice-to-Text for macOS, Windows & Linux

A privacy-first desktop dictation app that turns your voice into text, notes, and actions. Press a hotkey, speak, and your words appear at your cursor — in any application.

**🔒 Local by default** - Transcription runs on your machine with whisper.cpp or NVIDIA Parakeet. No account, no telemetry, no audio leaving your device unless you explicitly choose a cloud provider and supply your own key.

© 2024-2026 MANTISWARE. All rights reserved.

---

## ✨ Features

### Core Dictation

- **⌨️ Global Hotkey**: Dictate into any app from anywhere, with automatic pasting at your cursor
- **🎛️ Tap or Push-to-Talk**: Tap to toggle, or hold your hotkey to record and release to transcribe
- **🤖 Local Transcription**: whisper.cpp and NVIDIA Parakeet run entirely on-device — no cloud, no subscription
- **⚡ GPU Acceleration**: Local Whisper on Metal, CUDA, and Vulkan (AMD/Intel)
- **🌍 60 Languages**: Plus automatic language detection
- **🌊 Live Preview**: Streaming models show words as you speak
- **📚 Custom Dictionary**: Teach it names, jargon, and acronyms for better accuracy
- **🔄 Dictation Translation**: A dedicated hotkey to speak one language and paste another
- **📜 History**: Search, copy, and manage past transcriptions

### Voice Assistant

- **🎙️ Assistant Hotkey**: A dedicated hotkey that sends what you say straight to your AI assistant as a command — no wake word, no cleanup pass
- **✍️ Edit in Place**: Highlight text, speak an instruction, and the selection is rewritten where it sits
- **🪟 Floating Panel**: Answers paste at a focused text cursor, or stream into a panel and copy to the clipboard when there's nowhere safe to type
- **🖥️ Screen Context**: Opt in to attaching a screenshot of your current display as context
- **🧰 Tools**: Notes search and creation, calendar lookups, web search, and clipboard access

### Meetings & Notes

- **📞 Meeting Transcription**: Auto-detects Zoom, Teams, Webex, and FaceTime calls and captures both sides
- **🗣️ Speaker Diarization**: On-device speaker labelling with voice fingerprint recognition across meetings
- **📅 Calendar Integration**: Google, Microsoft, and Apple Calendar for meeting names, reminders, and join links
- **📝 Notes**: Folders, AI actions, and offline semantic search that finds notes by meaning rather than keywords
- **📥 Audio Import**: Transcribe existing audio and video — drag in files, batch-upload, or paste a YouTube URL

### Privacy & Platform

- **🔐 Keys Encrypted at Rest**: API keys stored via the OS keychain (Keychain / DPAPI / libsecret)
- **🚫 No Telemetry**: Nothing is collected, and there is no account to create
- **🖥️ Cross-Platform**: macOS, Windows, and Linux (X11 and Wayland, including GNOME, KDE, and Hyprland)
- **🌐 10 UI Languages**: English, Spanish, French, German, Portuguese, Italian, Russian, Japanese, and Simplified/Traditional Chinese

---

## 📋 Prerequisites

### For End Users

- **macOS**: Apple Silicon or Intel, on a release still supported by Electron 41
- **Windows**: Windows 10 or later — system-audio meeting capture needs version 2004+, and falls back gracefully below that
- **Linux**: Ubuntu 22.04+, Fedora 37+, or equivalent, on X11 or Wayland
- **RAM**: 8GB minimum, 16GB recommended for larger models
- **Disk Space**: ~1GB for the app, plus 75MB–3GB per speech model

**System permissions:**

- 🎤 **Microphone** — required on all platforms
- ♿ **Accessibility** — macOS only, required for automatic pasting
- 🖥️ **Screen Recording** — macOS only, and only if you enable screen context or system-audio meeting capture

Everything else ships with the app. Speech models, the local LLM server, the vector database, and FFmpeg are bundled or downloaded on first use.

### For Developers

- **Node.js 24** — pinned in `.nvmrc`, and CI uses it too
- **Platform toolchain** — Xcode Command Line Tools on macOS, Visual Studio Build Tools on Windows, `build-essential` on Linux (native modules are rebuilt against the host)

> ⚠️ Always install with Node 24 (`nvm exec 24 npm install`). A different major version rewrites `package-lock.json` incompatibly and breaks `npm ci` in CI.

---

## 📦 Download & Installation

Grab the latest build from the [EchoCraft download share](https://storage.mantisware.co.za/s/T9p24tDSSKr5jG7):

| Platform              | Download                                  |
| --------------------- | ----------------------------------------- |
| macOS (Apple Silicon) | `.dmg`                                    |
| Windows               | `.exe` (NSIS installer)                   |
| Linux                 | `.AppImage` / `.deb` / `.rpm` / `.tar.gz` |

Unsigned local builds are quarantined by Gatekeeper. Clear the flag after installing:

```bash
xattr -dr com.apple.quarantine "/Applications/EchoCraft.app"
```

---

## 🛠️ Developer Installation

### 1. Clone & Install

```bash
git clone git@github.com:MantisWare/echoCraft2.git
cd echoCraft2
nvm use 24
npm install
```

`postinstall` rebuilds native modules, and the `predev` hooks download the sidecar binaries (whisper.cpp, sherpa-onnx, llama.cpp, Qdrant, yt-dlp) on first run.

### 2. Run in Development

```bash
npm run dev
```

This starts the Vite dev server and Electron together. The embedding model for semantic search downloads automatically on first launch.

### 3. Build the Application

```bash
./build-macos.sh          # local DMG for this Mac (does not publish)
.\build-windows.ps1       # local NSIS installer (PowerShell on Windows)
./build-linux.sh          # local AppImage + deb
```

Each script compiles native helpers, downloads sidecars, builds the renderer, and packs the installer into `dist/`. Pass `--help` to any of them for architecture, target, and signing options. To publish a signed update, use the `release-*` scripts below.

---

## 🎮 Using EchoCraft

### First Launch

An onboarding flow walks you through choosing local or bring-your-own-key processing, downloading a speech model, granting permissions, setting your hotkey, and naming your assistant.

### Hotkeys

| Action              | Default (macOS) | Default (Windows/Linux) |
| ------------------- | --------------- | ----------------------- |
| Dictate             | Globe / Fn      | Control+Super           |
| Voice assistant     | Unset (opt-in)  | Unset (opt-in)          |
| Dictation translate | Unset (opt-in)  | Unset (opt-in)          |
| Meeting capture     | Unset (opt-in)  | Unset (opt-in)          |

All four are configurable under Settings → Hotkeys, with conflict detection between slots. If a default can't be registered, EchoCraft falls back to F8/F9 and tells you.

### Tips

- **Pick the right model**: `base` is the best speed/accuracy balance; `turbo` is fast and noticeably more accurate; `large` is best but slow on CPU
- **Feed the dictionary**: Adding names and jargon to the custom dictionary fixes most recurring mistakes
- **Streaming models preview live**: Choose a Nemotron streaming model to see text appear as you talk
- **Wayland needs a paste tool**: Install `wtype` (Hyprland/Sway) or `xdotool` (X11) for automatic pasting

---

## 🧠 Models & Providers

### Local Speech-to-Text (no key required)

- **whisper.cpp** — `tiny`, `base`, `small`, `medium`, `large`, `turbo`
- **NVIDIA Parakeet** — multilingual and English-only, via sherpa-onnx
- **Nemotron Streaming** — cache-aware streaming models for live preview
- **Cohere Transcribe** — the most accurate local option, one language per session

### Local LLMs (no key required)

GGUF models served by llama.cpp: Qwen, Llama, Mistral, Gemma, GPT-OSS, and LiquidAI.

### Bring Your Own Key (optional)

Supply your own API key to use a hosted provider. Keys are encrypted at rest and never proxied through a middleman.

- **Speech-to-text**: OpenAI, Groq, xAI, Mistral, Gemini, Corti, Tinfoil
- **AI reasoning**: OpenAI, Anthropic, Gemini, Groq, Hugging Face, Tinfoil, Corti
- **Self-hosted**: Any OpenAI-compatible endpoint, or a non-compatible ASR API via the [custom ASR shim](examples/custom-asr-shim/)

---

## 📁 Project Structure

```
main.js                 Electron entry point, manager initialization
preload.js              Context-isolated IPC bridge
src/
  components/           React UI (dictation panel, control panel, onboarding)
  helpers/              Main-process managers (audio, whisper, hotkeys, meetings)
  hooks/                React hooks (recording, settings, permissions)
  services/             AI inference, provider registry
  stores/               Zustand state
  models/               Model registry (single source of truth)
  locales/              i18n translations (10 languages)
  workers/              ONNX utility process
scripts/                Build, download, and native-compile scripts
resources/              Native helper sources and bundled binaries
test/                   Node test-runner suite
agent-skills/           CLI skill for AI coding agents
```

---

## 🛠️ Development Scripts

| Script                  | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `npm run dev`           | Vite dev server + Electron                 |
| `npm test`              | Full test suite (Node test runner)         |
| `npm run lint`          | ESLint across root and renderer            |
| `npm run typecheck`     | `tsc --noEmit`                             |
| `npm run quality-check` | Format check + typecheck                   |
| `npm run i18n:check`    | Verify translation keys across all locales |
| `npm run format`        | ESLint `--fix` + Prettier                  |
| `npm run clean`         | Remove build artifacts and caches          |

---

## 📦 Building for Distribution

Production releases are signed locally on each native OS and uploaded to the Nextcloud update feed. See **[docs/RELEASING.md](docs/RELEASING.md)**.

```bash
./release-macos.sh        # bump patch, sign, notarize, upload
.\release-windows.ps1     # same version, sign, upload (PowerShell on Windows)
./release-linux.sh        # same version, upload
./upload.sh               # upload whatever complete platforms are already in dist/
.\upload.ps1              # same as upload.sh, from PowerShell
```

Only macOS changes `package.json`. Windows and Linux reuse that version. `./build-macos.sh` is still for local unsigned DMGs and does not publish. Signed Windows releases use `CSC_LINK` / `CSC_KEY_PASSWORD`, not Azure Trusted Signing.

---

## 🐛 Troubleshooting

### No audio detected

Check microphone permissions, confirm the right input device under Settings → Audio, and look for audio-level entries in the debug log.

### Transcription fails

Make sure the speech model finished downloading and that the whisper.cpp binary exists in `resources/bin/`. Run `npm run download:whisper-cpp` if it's missing.

### Automatic pasting doesn't work

- **macOS**: Grant Accessibility permission — it's required for the paste keystroke
- **Linux X11**: Install `xdotool`
- **Linux Wayland**: Install `wtype`; GNOME and KDE also work through the desktop portal
- **Windows**: Uses built-in PowerShell SendKeys, with a bundled `nircmd.exe` fallback

### Hotkey doesn't fire

On GNOME, KDE, and Hyprland under Wayland, EchoCraft registers a native compositor shortcut instead of an Electron one. Check the debug log to see which path it took. Push-to-talk is unavailable on those compositors, which only deliver a single toggle event.

### Semantic search returns nothing

Qdrant should start with the app, and the embedding model downloads on first launch. If either is missing, notes search falls back to keyword matching and still works. Run `npm run download:qdrant` and `npm run download:embedding-model` to fix it manually.

For anything else, see **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** and enable debug logging with `--log-level=debug`.

---

## 📚 Documentation

- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** — Common problems and fixes
- **[LOCAL_WHISPER_SETUP.md](LOCAL_WHISPER_SETUP.md)** — Local speech-to-text setup in depth
- **[DEBUG.md](DEBUG.md)** — Debug logging and log file locations
- **[SECURITY.md](SECURITY.md)** — Reporting vulnerabilities
- **[docs/RELEASING.md](docs/RELEASING.md)** — Signed local releases and the Nextcloud update feed
- **[CLAUDE.md](CLAUDE.md)** — Architecture reference for AI coding assistants
- **[docs/network-allowlist.md](docs/network-allowlist.md)** — Outbound hosts for locked-down networks
- **[examples/](examples/)** — Custom ASR shim for self-hosted transcription

---

## 🧰 Tech Stack

React 19, TypeScript, Tailwind CSS v4, Vite, Electron 41, better-sqlite3, whisper.cpp, sherpa-onnx, llama.cpp, Qdrant, ONNX Runtime, shadcn/ui.

---

## 🙏 Acknowledgments

- **[OpenAI Whisper](https://github.com/openai/whisper)** — the speech recognition model behind local transcription
- **[whisper.cpp](https://github.com/ggerganov/whisper.cpp)** — high-performance C++ inference
- **[NVIDIA Parakeet](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)** — fast multilingual ASR
- **[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)** — cross-platform ONNX runtime for Parakeet
- **[llama.cpp](https://github.com/ggerganov/llama.cpp)** — local LLM inference
- **[Qdrant](https://qdrant.tech/)** — vector database powering offline semantic search
- **[Hugging Face](https://huggingface.co/)** — model hub hosting Whisper, Parakeet, and embedding weights
- **[Electron](https://www.electronjs.org/)** — cross-platform desktop framework
- **[React](https://react.dev/)** and **[shadcn/ui](https://ui.shadcn.com/)** — UI foundation

---

## 📝 License

[MIT](LICENSE) — free for personal and commercial use.

EchoCraft builds on open-source work released under the MIT license; the upstream copyright notice is retained in [LICENSE](LICENSE) as that license requires.

---

## 👨‍💻 Author

**MANTISWARE** — [mantisware.co.za](https://mantisware.co.za)

---

**Made with ❤️ and ✨ echoey waves**
