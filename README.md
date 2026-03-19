# ReelForge

**Drop a raw talking head video. Get back a finished Instagram reel.**

Captions, cuts, branding — done. Runs as a macOS menu bar app.

---

## What It Does

1. **You pick a video** from the menu bar app (or drop it in the `input/` folder)
2. **Groq Whisper** transcribes every word with millisecond-accurate timestamps
3. **Claude** reads the transcript and decides what to cut — pauses, false starts, dead air
4. **Remotion** renders the final reel with animated word-by-word captions and delivery-based emphasis
5. **You get a finished `.mp4`** auto-named from the content, ready to post

---

## Quick Start

### Prerequisites

- **Node.js** 20+
- **Rust** toolchain (for the Tauri menu bar app)
- **ffmpeg** + **ffprobe** installed
- API keys for [Groq](https://console.groq.com) (Whisper) and [Anthropic](https://console.anthropic.com) (Claude)

### Setup

```bash
git clone https://github.com/phillhendry/reelforge.git
cd reelforge
npm install

# Add your API keys
cp .env.example .env
# Edit .env — add GROQ_API_KEY and ANTHROPIC_API_KEY
```

### Run the Menu Bar App

```bash
npm run tauri:dev
```

Click the tray icon to open the UI. Pick a video, hit render.

### Or Run Without Tauri

```bash
# Start the web server
npm run server
# Open http://localhost:3100

# Or use the CLI directly
npm run process -- ./input/my-video.mp4
```

---

## Menu Bar App

ReelForge runs as a macOS system tray app built with Tauri:

- Click the menu bar icon to toggle the popover
- No dock icon — stays out of your way
- Spawns the Express server automatically
- Open input/output folders in Finder from the UI
- Build a standalone `.app` with `npm run tauri:build`

---

## Features

### AI Editing

Claude analyses the transcript and produces an edit decision list:

- Cuts pauses >800ms, false starts, repeated phrases
- Keeps natural speech rhythm — single filler words in flowing sentences stay
- Snaps cuts to word boundaries with 80ms/150ms padding so nothing clips
- Fade-to-black ending with 400ms tail after the last word

### Smart Captions

Uses Remotion's native `@remotion/captions` system:

- `createTikTokStyleCaptions()` for word grouping
- Each caption page gets its own `<Sequence>` for frame-perfect timing
- **Delivery-based emphasis** — words spoken slower than median pace or after a pause get a bigger visual pop (larger scale, snappier spring, subtle highlight retention)

### Caption Styles

| Style | Description |
|-------|-------------|
| `highlight` | Accent background highlights the active word |
| `bounce` | Active word scales up with a spring animation |
| `typewriter` | Words fade in as they're spoken |
| `minimal` | Active word is white, others are dimmed |

### Output Presets

| Preset | Dimensions | Use Case |
|--------|-----------|----------|
| `instagramReel` | 1080x1920 (9:16) | Instagram Reels, TikTok |
| `youtubeShort` | 1080x1920 (9:16) | YouTube Shorts |
| `instagramSquare` | 1080x1080 (1:1) | Instagram Feed |
| `landscape` | 1920x1080 (16:9) | YouTube, LinkedIn |

### Multi-Job Support

- Queue multiple renders — each gets its own progress bar
- Cancel any active job mid-render
- Auto-watch mode processes files dropped in `input/` (max 2 concurrent)
- Toggle auto-watch on/off from the UI
- Clear finished jobs individually or all at once

### Content-Based Filenames

Output files are auto-named from the AI analysis summary:
```
speaker-shares-tips-on-design-systems_2026-03-19T14-30-00.mp4
```

---

## CLI

```bash
# Full edit + captions
npm run process -- ./input/raw-take.mp4

# Captions only — no AI editing
npm run process -- ./input/raw-take.mp4 --no-cuts

# Different caption style
npm run process -- ./input/raw-take.mp4 --caption-style=bounce

# YouTube Shorts preset
npm run process -- ./input/raw-take.mp4 --preset=youtubeShort

# Save debug files (transcript + EDL as JSON)
npm run process -- ./input/raw-take.mp4 --debug
```

---

## API

Start the server with `npm run server` (port 3100).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/render` | Start a render (used by the UI) |
| `POST` | `/render/talking-head` | Start a render with full options |
| `POST` | `/render/carousel` | Render carousel slides as a reel |
| `GET` | `/status/:jobId` | Poll job progress |
| `GET` | `/jobs` | List all jobs |
| `POST` | `/cancel/:jobId` | Cancel an active job |
| `DELETE` | `/jobs` | Clear all finished jobs |
| `DELETE` | `/jobs/:jobId` | Clear a single finished job |
| `POST` | `/auto-watch` | Toggle auto-processing `{ "enabled": true }` |
| `GET` | `/files` | List videos in input directory |
| `POST` | `/open-folder/input` | Open input folder in Finder |
| `POST` | `/open-folder/output` | Open output folder in Finder |
| `GET` | `/health` | Health check |

---

## Architecture

```
input/video.mp4
       │
       ▼
  ┌──────────┐
  │  Probe   │  ffprobe → dimensions, duration, fps
  └────┬─────┘
       ▼
  ┌──────────────┐
  │  Transcribe  │  Groq Whisper → Remotion Caption[]
  └──────┬───────┘
       ▼
  ┌──────────────┐
  │   Analyse    │  Claude → edit decision list
  └──────┬───────┘
       ▼
  ┌──────────────┐
  │  Pad + Remap │  Pad EDL for playback, remap captions
  └──────┬───────┘
       ▼
  ┌──────────────┐
  │  Emphasis    │  Detect stressed words from delivery
  └──────┬───────┘
       ▼
  ┌──────────────┐
  │   Render     │  Remotion SSR → MP4
  └──────┬───────┘
       ▼
output/content-summary_2026-03-19.mp4
```

### Stack

- **Remotion** — React-based video rendering with native caption support
- **Groq Whisper** — Fast cloud transcription with word-level timestamps
- **Claude** — AI editing decisions (not content generation)
- **Express** — HTTP server + file watcher
- **Tauri** — macOS menu bar app wrapper (~5MB binary)

---

## Brand Configuration

Set in `.env` or pass via API:

```env
BRAND_PRIMARY_COLOR=#ffffff
BRAND_ACCENT_COLOR=#E8FF00
BRAND_FONT_FAMILY=Inter
```

---

## Building the App

```bash
# Development (hot-reload)
npm run tauri:dev

# Production build
npm run tauri:build
```

Output:
- `src-tauri/target/release/bundle/macos/ReelForge.app`
- `src-tauri/target/release/bundle/dmg/ReelForge_1.0.0_aarch64.dmg`

---

## License

MIT. Remotion is free for individuals and companies up to 3 people.

Built by Phill. Blame Claude.
