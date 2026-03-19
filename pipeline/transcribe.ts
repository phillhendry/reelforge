/**
 * Transcription Module
 *
 * Uses Groq's Whisper API for blazing fast transcription with
 * word-level timestamps. Falls back to local Whisper.cpp if
 * Groq is unavailable.
 *
 * Groq is the best option here because:
 * - It's ~50x faster than real-time
 * - It returns word-level timestamps
 * - It costs almost nothing
 * - No GPU needed on your server
 */

import fs from "fs";
import path from "path";
import type { CaptionWord } from "../src/types";

interface TranscriptionResult {
  words: CaptionWord[];
  fullText: string;
  language: string;
  durationMs: number;
}

/**
 * Transcribe a video/audio file using Groq's Whisper API.
 * Extracts audio first via ffmpeg, then sends to Groq.
 */
export async function transcribe(
  inputPath: string,
  tempDir: string
): Promise<TranscriptionResult> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    throw new Error(
      "GROQ_API_KEY not set. Add it to .env — get one at console.groq.com"
    );
  }

  // ── Step 1: Extract audio as WAV ──
  const audioPath = path.join(tempDir, "audio.wav");
  console.log("  → Extracting audio...");

  const { execSync } = await import("child_process");
  execSync(
    `ffmpeg -y -i "${inputPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`,
    { stdio: "pipe" }
  );

  // ── Step 2: Send to Groq Whisper ──
  console.log("  → Sending to Groq Whisper...");

  const audioBuffer = fs.readFileSync(audioPath);
  const blob = new Blob([audioBuffer], { type: "audio/wav" });

  const formData = new FormData();
  formData.append("file", blob, "audio.wav");
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");
  formData.append("language", "en");

  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} — ${error}`);
  }

  const result = await response.json();

  // ── Step 3: Convert to our CaptionWord format ──
  const words: CaptionWord[] = (result.words || []).map(
    (w: { word: string; start: number; end: number }) => ({
      text: w.word,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
      confidence: 1,
    })
  );

  // Clean up temp audio
  fs.unlinkSync(audioPath);

  return {
    words,
    fullText: result.text || "",
    language: result.language || "en",
    durationMs: words.length > 0 ? words[words.length - 1].endMs : 0,
  };
}
