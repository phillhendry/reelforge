/**
 * Transcription Module
 *
 * Uses Groq's Whisper API for blazing fast transcription with
 * word-level timestamps. Returns Remotion-native Caption[] so we
 * can feed it straight into createTikTokStyleCaptions().
 *
 * Groq is the best option here because:
 * - It's ~50x faster than real-time
 * - It returns word-level timestamps
 * - It costs almost nothing
 * - No GPU needed on your server
 */

import fs from "fs";
import path from "path";
import type { Caption } from "@remotion/captions";

interface TranscriptionResult {
  captions: Caption[];
  fullText: string;
  language: string;
  durationMs: number;
}

/**
 * Transcribe a video/audio file using Groq's Whisper API.
 * Extracts audio first via ffmpeg, then sends to Groq.
 * Returns Remotion-native Caption[] with leading whitespace preserved.
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
  const audioPath = path.join(tempDir, `audio_${Date.now()}.wav`);
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

  // ── Step 3: Convert to Remotion's Caption format ──
  // CRITICAL: text must include leading whitespace for proper rendering.
  // Remotion uses whiteSpace: 'pre' and relies on the space being in the text.
  const captions: Caption[] = (result.words || []).map(
    (w: { word: string; start: number; end: number }, i: number) => {
      const startMs = Math.round(w.start * 1000);
      const endMs = Math.round(w.end * 1000);
      // First word has no leading space; all others get one
      const text = i === 0 ? w.word.trim() : ` ${w.word.trim()}`;
      return {
        text,
        startMs,
        endMs,
        timestampMs: startMs + Math.round((endMs - startMs) / 2),
        confidence: 1,
      };
    }
  );

  // Clean up temp audio
  try { fs.unlinkSync(audioPath); } catch {}

  console.log(`  → Transcribed ${captions.length} words`);

  return {
    captions,
    fullText: result.text || "",
    language: result.language || "en",
    durationMs: captions.length > 0 ? captions[captions.length - 1].endMs : 0,
  };
}
