# ⚡ ReelForge

**Drop a raw talking head video. Get back a finished Instagram reel.**

Captions, cuts, branding — done. No editing software needed.

---

## What It Does

1. **You drop a raw video** into the `input/` folder (or POST to the API)
2. **Groq Whisper** transcribes every word with millisecond-accurate timestamps
3. **Claude** reads the transcript and decides what to cut — pauses, ums, false starts, dead air
4. **Remotion** renders the final reel — trimmed, with animated word-by-word captions, branded
5. **You get a finished `.mp4`** in `output/`, ready to post

The whole pipeline runs unattended. Walk away, come back to a polished reel.

---

## Quick Start

```bash
# 1. Clone and install
cd reelforge
npm install

# 2. Set up your API keys
cp .env.example .env
# Edit .env — add your GROQ_API_KEY and ANTHROPIC_API_KEY

# 3. Process a video
npm run process -- ./input/my-raw-take.mp4

# Or start the render server
npm run server
```

### Get API Keys

- **Groq** (for Whisper transcription): [console.groq.com](https://console.groq.com) — free tier is generous
- **Anthropic** (for Claude edit analysis): [console.anthropic.com](https://console.anthropic.com)

---

## Usage

### CLI Pipeline

```bash
# Basic — full edit + captions
tsx pipeline/process.ts ./input/raw-take.mp4

# Captions only — no AI editing, keep the full video
tsx pipeline/process.ts ./input/raw-take.mp4 --no-cuts

# Different caption style
tsx pipeline/process.ts ./input/raw-take.mp4 --caption-style=bounce

# YouTube Shorts format
tsx pipeline/process.ts ./input/raw-take.mp4 --preset=youtubeShort

# Save debug files (transcript + edit decision list)
tsx pipeline/process.ts ./input/raw-take.mp4 --debug
```

### Render Server (for n8n / automation)

```bash
npm run server
```

#### Endpoints

**POST `/render/talking-head`**
```json
{
  "inputPath": "/absolute/path/to/video.mp4",
  "preset": "instagramReel",
  "captionStyle": "highlight",
  "noCuts": false
}
```
Returns `{ "jobId": "th_...", "status": "accepted" }`

**POST `/render/carousel`**
```json
{
  "slides": [
    { "headline": "5 Things About Design", "body": "Optional body text" },
    { "headline": "1. Start Simple", "body": "Then iterate." }
  ],
  "secondsPerSlide": 4
}
```

**GET `/status/:jobId`** — poll for progress

**GET `/health`** — health check

### Auto-Processing (File Watcher)

When the server is running, it watches the `input/` directory. Drop any `.mp4`, `.mov`, `.webm`, or `.mkv` file in there and it auto-triggers the full pipeline.

---

## Compositions

### TalkingHead

The main composition. Takes raw footage and produces a finished reel.

- **Smart cropping** — portrait source fills the frame; landscape source auto-crops to center
- **AI-powered cuts** — removes dead air, filler words, false starts, repeated phrases
- **Animated captions** — word-by-word highlight, TikTok/Reels style
- **Progress bar** — subtle bar at the top of the frame
- **Instagram safe zones** — captions positioned to avoid IG's UI overlay

### CarouselReel

Turns slide data into an animated video. Perfect for repurposing carousel posts.

- **Animated text entrance** — spring-based headline and body animations
- **Slide counter** — "1/5" indicator in the corner
- **Accent line** — animated brand-colored divider
- **Auto-palette** — cycles through dark backgrounds if no custom colors specified

---

## Caption Styles

| Style | Description |
|-------|-------------|
| `highlight` | Yellow (accent) background highlights the active word |
| `bounce` | Active word scales up with a spring animation |
| `typewriter` | Words fade in as they're spoken |
| `minimal` | Active word is white, others are dimmed |

---

## Output Presets

| Preset | Dimensions | Use Case |
|--------|-----------|----------|
| `instagramReel` | 1080×1920 (9:16) | Instagram Reels, TikTok |
| `youtubeShort` | 1080×1920 (9:16) | YouTube Shorts |
| `instagramSquare` | 1080×1080 (1:1) | Instagram Feed |
| `landscape` | 1920×1080 (16:9) | YouTube, LinkedIn |

---

## Brand Configuration

Set in `.env` or pass via API:

```env
BRAND_PRIMARY_COLOR=#ffffff
BRAND_ACCENT_COLOR=#E8FF00    # The caption highlight color
BRAND_FONT_FAMILY=Inter
CAPTION_STYLE=highlight
```

---

## Architecture

```
input/raw-take.mp4
        │
        ▼
   ┌─────────┐
   │  Probe   │ ← ffprobe: dimensions, duration, fps, aspect
   └────┬─────┘
        ▼
   ┌──────────────┐
   │  Transcribe  │ ← Groq Whisper: word-level timestamps
   └──────┬───────┘
        ▼
   ┌──────────────┐
   │   Analyse    │ ← Claude: edit decision list (keep/cut/hook)
   └──────┬───────┘
        ▼
   ┌──────────────┐
   │ Caption Pages│ ← Group words into display pages
   └──────┬───────┘
        ▼
   ┌──────────────┐
   │   Render     │ ← Remotion: composites video + captions + brand
   └──────┬───────┘
        ▼
output/raw-take_reel_2026-03-19.mp4
```

---

## Deployment (Coolify)

This project is designed to run as a service on your Hetzner box via Coolify.

**Requirements:**
- Node.js 20+
- Chrome/Chromium (for Remotion rendering)
- ffmpeg + ffprobe

**Docker support:** A Dockerfile is on the roadmap. For now, run directly with Node.

**n8n integration:** Point n8n HTTP Request nodes at `http://reelforge:3100/render/talking-head` to trigger renders from your automation workflows.

---

## Remotion Studio

For previewing and iterating on compositions:

```bash
npm run studio
```

Opens at `http://localhost:3000` with a live preview of all compositions. Edit props in the sidebar to test different configurations.

---

## Roadmap

- [ ] Dockerfile for Coolify deployment
- [ ] Telegram bot integration (send video via Telegram, get reel back)
- [ ] n8n webhook for completion notifications
- [ ] Face detection for smart landscape→portrait cropping
- [ ] Music bed support (auto-duck under speech)
- [ ] Branded intro/outro sequences
- [ ] Batch processing (drop a folder of videos)
- [ ] Hook reordering (move the best segment to the start)

---

## License

Remotion is free for individuals and companies up to 3 people (including commercial use).

Built by Phill. Blame Claude.
