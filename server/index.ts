#!/usr/bin/env tsx
/**
 * ReelForge Render Server
 *
 * A simple Express server that exposes the pipeline as an HTTP API.
 *
 * Endpoints:
 *   POST /render/talking-head   — full pipeline: transcribe → analyse → render
 *   POST /render/carousel       — carousel slides → animated reel
 *   POST /render                — simplified render (used by Web UI)
 *   GET  /status/:jobId         — check render progress
 *   GET  /health                — health check
 *
 * The server watches the input directory for new files too,
 * so you can just drop a file in and it auto-processes.
 */

import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { probeVideo } from "../pipeline/probe";
import { transcribe } from "../pipeline/transcribe";
import { analyse } from "../pipeline/analyse";
import { remapCaptionsToEdl, padEdlForPlayback, detectEmphasis } from "../pipeline/captions";
import { renderTalkingHead, renderCarouselReel } from "../pipeline/render";
import { DEFAULT_BRAND, OUTPUT_PRESETS } from "../src/lib/brand";
import type {
  PipelineStatus,
  TalkingHeadProps,
  CarouselReelProps,
  BrandConfig,
} from "../src/types";

const app = express();
app.use(express.json({ limit: "10mb" }));

/** Turn a content summary into a short, filesystem-safe slug */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50)
    .replace(/-$/, "") || "reel";
}

const PORT = parseInt(process.env.PORT || "3100");
const INPUT_DIR = path.resolve(process.env.INPUT_DIR || "./input");
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || "./output");
const TEMP_DIR = path.resolve(process.env.TEMP_DIR || "./temp");

// Ensure directories exist
[INPUT_DIR, OUTPUT_DIR, TEMP_DIR].forEach((d) =>
  fs.mkdirSync(d, { recursive: true })
);

// ── Static files (Web UI) ────────────────────────────────
const WEB_DIR = path.resolve(__dirname, "../web");
app.use(express.static(WEB_DIR));

// ── Serve local video files for Remotion ─────────────────
app.get("/media/*", (req, res) => {
  // /media/absolute/path/to/file.mp4 → serves that file
  const filePath = "/" + req.params[0];
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.sendFile(filePath);
});


// ── Job tracking ──────────────────────────────────────────

const jobs = new Map<string, PipelineStatus>();

function createJob(id: string): PipelineStatus {
  const status: PipelineStatus = {
    stage: "ingest",
    progress: 0,
    message: "Starting...",
    startedAt: Date.now(),
  };
  jobs.set(id, status);
  return status;
}

function updateJob(
  id: string,
  update: Partial<PipelineStatus>
) {
  const job = jobs.get(id);
  if (job) Object.assign(job, update);
}

// ── Health check ──────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "reelforge",
    uptime: process.uptime(),
    activeJobs: jobs.size,
    autoWatch: autoWatchEnabled,
  });
});

// ── Job status ────────────────────────────────────────────

app.get("/status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

// ── Talking Head render ───────────────────────────────────

app.post("/render/talking-head", async (req, res) => {
  const {
    inputPath,
    preset = "instagramReel",
    captionStyle = "highlight",
    noCuts = false,
    brand: brandOverrides = {},
  } = req.body;

  if (!inputPath) {
    res.status(400).json({ error: "inputPath is required" });
    return;
  }

  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    res.status(400).json({ error: `File not found: ${resolvedInput}` });
    return;
  }

  const jobId = `th_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  createJob(jobId);
  processedFiles.add(path.basename(resolvedInput));

  // Respond immediately with job ID
  res.json({ jobId, status: "accepted" });

  // Process in background
  const controller = new AbortController();
  abortControllers.set(jobId, controller);
  processTalkingHead(jobId, resolvedInput, preset, captionStyle, noCuts, brandOverrides, controller.signal).catch(
    (err) => {
      if (err.name !== "AbortError") {
        console.error(`Job ${jobId} failed:`, err);
        updateJob(jobId, {
          stage: "error",
          message: err.message,
          error: err.message,
        });
      }
    }
  ).finally(() => abortControllers.delete(jobId));
});

async function processTalkingHead(
  jobId: string,
  inputPath: string,
  presetName: string,
  captionStyle: BrandConfig["captionStyle"],
  noCuts: boolean,
  brandOverrides: Partial<BrandConfig>,
  signal?: AbortSignal
) {
  const checkCancelled = () => {
    if (signal?.aborted) {
      throw new DOMException("Job cancelled", "AbortError");
    }
  };
  const presetConfig =
    OUTPUT_PRESETS[presetName as keyof typeof OUTPUT_PRESETS] ||
    OUTPUT_PRESETS.instagramReel;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  // Stage 1: Probe
  updateJob(jobId, { stage: "ingest", progress: 5, message: "Probing video..." });
  const metadata = probeVideo(inputPath);
  checkCancelled();

  // Stage 2: Transcribe
  updateJob(jobId, {
    stage: "transcribe",
    progress: 15,
    message: "Transcribing audio...",
  });
  const transcript = await transcribe(inputPath, TEMP_DIR);
  checkCancelled();

  // Stage 3: Analyse (or skip)
  updateJob(jobId, {
    stage: "analyse",
    progress: 40,
    message: noCuts ? "Skipping AI editing..." : "AI editor analysing...",
  });

  let edl;
  if (noCuts) {
    edl = {
      keeps: [
        { startMs: 0, endMs: metadata.durationMs, reason: "content" as const },
      ],
      cuts: [],
      estimatedDurationMs: metadata.durationMs,
      summary: "Full video — no cuts",
      suggestedCaption: "",
    };
  } else {
    edl = await analyse(
      transcript.captions,
      transcript.fullText,
      metadata.durationMs
    );
  }

  // Generate output filename from content summary
  const slug = slugify(edl.summary || transcript.fullText.slice(0, 60));
  const outputPath = path.join(OUTPUT_DIR, `${slug}_${timestamp}.mp4`);

  // Pad EDL for natural playback, then remap captions against the padded EDL
  const videoEdl = padEdlForPlayback(edl, metadata.durationMs);
  const remappedCaptions = remapCaptionsToEdl(transcript.captions, videoEdl);
  const emphasised = detectEmphasis(remappedCaptions);

  console.log(
    `  → ${transcript.captions.length} source captions → ${emphasised.length} remapped (${emphasised.filter(c => c.emphasis !== "normal").length} emphasised)`
  );

  checkCancelled();

  // Stage 4: Render
  updateJob(jobId, { stage: "render", progress: 55, message: "Rendering..." });

  const brand: BrandConfig = {
    ...DEFAULT_BRAND,
    captionStyle,
    ...brandOverrides,
  };

  const props: TalkingHeadProps = {
    sourceVideo: inputPath,
    captions: emphasised,
    edl: videoEdl,
    metadata,
    brand,
    outputWidth: presetConfig.width,
    outputHeight: presetConfig.height,
    outputFps: presetConfig.fps,
  };

  await renderTalkingHead(props, outputPath);

  updateJob(jobId, {
    stage: "complete",
    progress: 100,
    message: "Done!",
    completedAt: Date.now(),
    outputPath,
  });

  console.log(`✅ Job ${jobId} complete → ${outputPath}`);
}

// ── Carousel render ───────────────────────────────────────

app.post("/render/carousel", async (req, res) => {
  const {
    slides,
    preset = "instagramReel",
    secondsPerSlide = 4,
    brand: brandOverrides = {},
  } = req.body;

  if (!slides || !Array.isArray(slides) || slides.length === 0) {
    res.status(400).json({ error: "slides array is required" });
    return;
  }

  const jobId = `cr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  createJob(jobId);
  res.json({ jobId, status: "accepted" });

  const presetConfig =
    OUTPUT_PRESETS[preset as keyof typeof OUTPUT_PRESETS] ||
    OUTPUT_PRESETS.instagramReel;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputPath = path.join(OUTPUT_DIR, `carousel_reel_${timestamp}.mp4`);

  try {
    updateJob(jobId, { stage: "render", progress: 20, message: "Rendering carousel..." });

    const brand: BrandConfig = { ...DEFAULT_BRAND, ...brandOverrides };

    const props: CarouselReelProps = {
      slides: slides.map(
        (s: { headline: string; body?: string; backgroundColor?: string }, i: number) => ({
          ...s,
          slideNumber: i + 1,
          totalSlides: slides.length,
        })
      ),
      brand,
      secondsPerSlide,
      outputWidth: presetConfig.width,
      outputHeight: presetConfig.height,
      outputFps: presetConfig.fps,
    };

    await renderCarouselReel(props, outputPath);

    updateJob(jobId, {
      stage: "complete",
      progress: 100,
      message: "Done!",
      completedAt: Date.now(),
      outputPath,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    updateJob(jobId, { stage: "error", message, error: message });
  }
});

const processedFiles = new Set<string>();
const abortControllers = new Map<string, AbortController>();
let autoWatchEnabled = true;

// ── Cancel a running job ─────────────────────────────────

app.post("/cancel/:jobId", (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (job.stage === "complete" || job.stage === "error") {
    res.status(400).json({ error: "Job already finished" });
    return;
  }

  const controller = abortControllers.get(jobId);
  if (controller) {
    controller.abort();
    abortControllers.delete(jobId);
  }

  updateJob(jobId, {
    stage: "error",
    message: "Cancelled by user",
    error: "Cancelled by user",
  });

  console.log(`⛔ Job ${jobId} cancelled`);
  res.json({ jobId, status: "cancelled" });
});

// ── Toggle auto-watch ────────────────────────────────────

app.post("/auto-watch", (req, res) => {
  const { enabled } = req.body;
  autoWatchEnabled = enabled !== false;
  console.log(`📁 Auto-watch ${autoWatchEnabled ? "enabled" : "paused"}`);
  res.json({ autoWatch: autoWatchEnabled });
});

app.get("/auto-watch", (_req, res) => {
  res.json({ autoWatch: autoWatchEnabled });
});

// ── Browse input directory ───────────────────────────────

app.get("/files", (_req, res) => {
  try {
    const files = fs.readdirSync(INPUT_DIR)
      .filter((f) => [".mp4", ".mov", ".webm", ".mkv"].includes(path.extname(f).toLowerCase()))
      .map((f) => {
        const stat = fs.statSync(path.join(INPUT_DIR, f));
        return {
          name: f,
          path: path.join(INPUT_DIR, f),
          sizeMb: +(stat.size / 1024 / 1024).toFixed(1),
          modified: stat.mtimeMs,
        };
      })
      .sort((a, b) => b.modified - a.modified);
    res.json({ inputDir: INPUT_DIR, files });
  } catch {
    res.json({ inputDir: INPUT_DIR, files: [] });
  }
});

// ── Start render (local file path — used by Web UI) ─────

app.post("/render", (req, res) => {
  const {
    inputPath,
    preset = "instagramReel",
    captionStyle = "highlight",
    noCuts = false,
  } = req.body;

  if (!inputPath) {
    res.status(400).json({ error: "inputPath is required" });
    return;
  }

  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    res.status(400).json({ error: `File not found: ${resolvedInput}` });
    return;
  }

  const jobId = `ui_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  createJob(jobId);
  processedFiles.add(path.basename(resolvedInput));

  const controller = new AbortController();
  abortControllers.set(jobId, controller);
  res.json({ jobId, status: "accepted" });

  processTalkingHead(jobId, resolvedInput, preset, captionStyle, noCuts, {}, controller.signal).catch(
    (err) => {
      if (err.name !== "AbortError") {
        console.error(`Job ${jobId} failed:`, err);
        updateJob(jobId, {
          stage: "error",
          message: err.message,
          error: err.message,
        });
      }
    }
  ).finally(() => abortControllers.delete(jobId));
});

// ── List all jobs ────────────────────────────────────────

app.get("/jobs", (_req, res) => {
  const list = Array.from(jobs.entries())
    .map(([id, status]) => ({ id, ...status }))
    .sort((a, b) => b.startedAt - a.startedAt);
  res.json(list);
});

// ── Serve output files for download ──────────────────────

app.get("/output/:filename", (req, res) => {
  const filename = path.basename(req.params.filename); // prevent traversal
  const filePath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.download(filePath);
});

// ── File watcher (auto-process dropped files) ─────────────

let watchDebounce: NodeJS.Timeout | null = null;

fs.watch(INPUT_DIR, (eventType, filename) => {
  if (!autoWatchEnabled) return;
  if (!filename || eventType !== "rename") return;
  if (processedFiles.has(filename)) return;

  const ext = path.extname(filename).toLowerCase();
  if (![".mp4", ".mov", ".webm", ".mkv"].includes(ext)) return;

  // Debounce to let the file finish writing
  if (watchDebounce) clearTimeout(watchDebounce);
  watchDebounce = setTimeout(async () => {
    const filePath = path.join(INPUT_DIR, filename);
    if (!fs.existsSync(filePath)) return;

    // Re-check — a UI render may have started during the debounce
    if (processedFiles.has(filename)) return;

    // Check file size is stable (finished writing)
    const size1 = fs.statSync(filePath).size;
    await new Promise((r) => setTimeout(r, 2000));
    const size2 = fs.statSync(filePath).size;
    if (size1 !== size2) return; // Still writing

    // Final check before processing
    if (processedFiles.has(filename)) return;

    processedFiles.add(filename);
    console.log(`\n📁 New file detected: ${filename}`);

    const jobId = `auto_${Date.now()}`;
    createJob(jobId);

    processTalkingHead(
      jobId,
      filePath,
      "instagramReel",
      "highlight",
      false,
      {}
    ).catch((err) => {
      console.error(`Auto-process failed for ${filename}:`, err.message);
    });
  }, 3000);
});

// ── Error handler (always return JSON, never HTML) ───────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: err.message });
});

// ── Start server ──────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║         ⚡ ReelForge Render Server            ║
╠══════════════════════════════════════════════╣
║  UI:       http://localhost:${PORT}              ║
║  Input:    ${INPUT_DIR}
║  Output:   ${OUTPUT_DIR}
║                                              ║
║  Endpoints:                                  ║
║    GET  /                 (Web UI)           ║
║    POST /render           (start render)     ║
║    GET  /files            (browse input)     ║
║    POST /render/talking-head                 ║
║    POST /render/carousel                     ║
║    GET  /jobs                                ║
║    GET  /status/:jobId                       ║
║    GET  /output/:filename                    ║
║    GET  /health                              ║
║                                              ║
║  Watching ${INPUT_DIR} for new files...
╚══════════════════════════════════════════════╝
  `);
});
