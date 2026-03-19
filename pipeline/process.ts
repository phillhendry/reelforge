#!/usr/bin/env tsx
/**
 * ═══════════════════════════════════════════════════════════════
 *  ReelForge Pipeline
 *  Drop a raw video → get a finished Instagram reel.
 * ═══════════════════════════════════════════════════════════════
 *
 *  Usage:
 *    tsx pipeline/process.ts <input-video> [options]
 *
 *  Examples:
 *    tsx pipeline/process.ts ./input/raw-take.mp4
 *    tsx pipeline/process.ts ./input/raw-take.mp4 --preset=youtubeShort
 *    tsx pipeline/process.ts ./input/raw-take.mp4 --caption-style=bounce
 *    tsx pipeline/process.ts ./input/raw-take.mp4 --no-cuts
 *
 *  Options:
 *    --preset=<name>         Output preset (instagramReel, youtubeShort, landscape)
 *    --caption-style=<name>  Caption style (highlight, bounce, typewriter, minimal)
 *    --no-cuts               Skip AI editing — just add captions to full video
 *    --output=<path>         Custom output path
 *    --debug                 Save intermediate files (transcript, EDL)
 *
 * ═══════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { probeVideo } from "./probe";
import { transcribe } from "./transcribe";
import { analyse } from "./analyse";
import { remapCaptionsToEdl, padEdlForPlayback, detectEmphasis } from "./captions";
import { renderTalkingHead } from "./render";
import { DEFAULT_BRAND, OUTPUT_PRESETS, type OutputPreset } from "../src/lib/brand";
import type { TalkingHeadProps, BrandConfig } from "../src/types";

// ── Parse CLI args ──────────────────────────────────────────

const args = process.argv.slice(2);
const inputFile = args.find((a) => !a.startsWith("--"));

if (!inputFile) {
  console.error(`
  ╔══════════════════════════════════════════════╗
  ║           ReelForge Pipeline                 ║
  ╠══════════════════════════════════════════════╣
  ║  Usage:                                      ║
  ║    tsx pipeline/process.ts <video-file>       ║
  ║                                              ║
  ║  Options:                                    ║
  ║    --preset=instagramReel|youtubeShort|...   ║
  ║    --caption-style=highlight|bounce|...      ║
  ║    --no-cuts   (captions only, no editing)   ║
  ║    --output=<path>                           ║
  ║    --debug                                   ║
  ╚══════════════════════════════════════════════╝
  `);
  process.exit(1);
}

function getArg(name: string): string | undefined {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg?.split("=")[1];
}

const hasFlag = (name: string) => args.includes(`--${name}`);

const presetName = (getArg("preset") || "instagramReel") as OutputPreset;
const captionStyle = (getArg("caption-style") || "highlight") as BrandConfig["captionStyle"];
const noCuts = hasFlag("no-cuts");
const debug = hasFlag("debug");
const customOutput = getArg("output");

// ── Validate ────────────────────────────────────────────────

const inputPath = path.resolve(inputFile);
if (!fs.existsSync(inputPath)) {
  console.error(`✗ File not found: ${inputPath}`);
  process.exit(1);
}

const preset = OUTPUT_PRESETS[presetName];
if (!preset) {
  console.error(
    `✗ Unknown preset "${presetName}". Options: ${Object.keys(OUTPUT_PRESETS).join(", ")}`
  );
  process.exit(1);
}

// ── Setup directories ───────────────────────────────────────

const tempDir = path.resolve(process.env.TEMP_DIR || "./temp");
const outputDir = path.resolve(process.env.OUTPUT_DIR || "./output");
fs.mkdirSync(tempDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

// ── GO ──────────────────────────────────────────────────────

async function run() {
  const startTime = Date.now();
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputPath =
    customOutput || path.join(outputDir, `${baseName}_reel_${timestamp}.mp4`);

  console.log(`
╔══════════════════════════════════════════════╗
║            ⚡ ReelForge Pipeline              ║
╚══════════════════════════════════════════════╝
`);
  console.log(`  Input:   ${inputPath}`);
  console.log(`  Output:  ${outputPath}`);
  console.log(`  Preset:  ${presetName} (${preset.width}×${preset.height})`);
  console.log(`  Style:   ${captionStyle}`);
  console.log(`  Mode:    ${noCuts ? "Captions only" : "Full edit + captions"}`);
  console.log("");

  // ── STAGE 1: Probe ──
  console.log("━━━ Stage 1/4: Ingest ━━━");
  const metadata = probeVideo(inputPath);
  console.log(
    `  ✓ ${metadata.width}×${metadata.height} | ${metadata.aspectMode} | ${Math.round(metadata.durationMs / 1000)}s | ${metadata.fps}fps`
  );
  console.log("");

  // ── STAGE 2: Transcribe ──
  console.log("━━━ Stage 2/4: Transcribe ━━━");
  const transcript = await transcribe(inputPath, tempDir);
  console.log(`  ✓ ${transcript.captions.length} words transcribed`);
  console.log(`  ✓ "${transcript.fullText.slice(0, 80)}..."`);

  if (debug) {
    const debugPath = path.join(tempDir, `${baseName}_transcript.json`);
    fs.writeFileSync(debugPath, JSON.stringify(transcript, null, 2));
    console.log(`  → Debug: saved transcript to ${debugPath}`);
  }
  console.log("");

  // ── STAGE 3: Analyse ──
  console.log("━━━ Stage 3/4: Analyse ━━━");
  let edl;

  if (noCuts) {
    // No cuts mode — keep everything
    edl = {
      keeps: [{ startMs: 0, endMs: metadata.durationMs, reason: "content" as const }],
      cuts: [],
      estimatedDurationMs: metadata.durationMs,
      summary: "Full video — no cuts applied",
      suggestedCaption: "",
    };
    console.log("  ✓ No-cuts mode — keeping full video");
  } else {
    edl = await analyse(transcript.captions, transcript.fullText, metadata.durationMs);
    const cutDuration = metadata.durationMs - edl.estimatedDurationMs;
    console.log(`  ✓ ${edl.keeps.length} segments to keep`);
    console.log(`  ✓ ${edl.cuts?.length || 0} segments to cut`);
    console.log(
      `  ✓ ${Math.round(metadata.durationMs / 1000)}s → ${Math.round(edl.estimatedDurationMs / 1000)}s (cut ${Math.round(cutDuration / 1000)}s)`
    );
    console.log(`  ✓ Caption: "${edl.suggestedCaption}"`);
  }

  if (debug) {
    const debugPath = path.join(tempDir, `${baseName}_edl.json`);
    fs.writeFileSync(debugPath, JSON.stringify(edl, null, 2));
    console.log(`  → Debug: saved EDL to ${debugPath}`);
  }
  console.log("");

  // ── Pad EDL for playback, remap captions against padded EDL, detect emphasis ──
  const videoEdl = padEdlForPlayback(edl, metadata.durationMs);
  const remappedCaptions = remapCaptionsToEdl(transcript.captions, videoEdl);
  const emphasised = detectEmphasis(remappedCaptions);
  console.log(`  ✓ ${emphasised.length} captions remapped (${emphasised.filter(c => c.emphasis !== "normal").length} emphasised)`);
  console.log("");

  // ── STAGE 4: Render ──
  console.log("━━━ Stage 4/4: Render ━━━");

  const brand: BrandConfig = {
    ...DEFAULT_BRAND,
    captionStyle,
    primaryColor: process.env.BRAND_PRIMARY_COLOR || DEFAULT_BRAND.primaryColor,
    accentColor: process.env.BRAND_ACCENT_COLOR || DEFAULT_BRAND.accentColor,
    fontFamily: process.env.BRAND_FONT_FAMILY || DEFAULT_BRAND.fontFamily,
  };

  const props: TalkingHeadProps = {
    sourceVideo: inputPath,
    captions: emphasised,
    edl: videoEdl,
    metadata,
    brand,
    outputWidth: preset.width,
    outputHeight: preset.height,
    outputFps: preset.fps,
  };

  await renderTalkingHead(props, outputPath);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const outputSize = fs.statSync(outputPath).size;
  const outputSizeMb = (outputSize / 1024 / 1024).toFixed(1);

  console.log(`
╔══════════════════════════════════════════════╗
║            ✅ ReelForge Complete              ║
╠══════════════════════════════════════════════╣
║  Output:  ${outputPath}
║  Size:    ${outputSizeMb} MB
║  Time:    ${elapsed}s
║  Caption: ${edl.suggestedCaption.slice(0, 40)}...
╚══════════════════════════════════════════════╝
  `);
}

run().catch((err) => {
  console.error("\n✗ Pipeline failed:", err.message);
  if (debug) {
    console.error(err.stack);
  }
  process.exit(1);
});
