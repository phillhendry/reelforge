/**
 * Analyse Module
 *
 * Sends the transcript + word timestamps to Claude, which acts as
 * your AI editor. Claude reads the transcript and decides:
 *
 * - What to keep (the good stuff)
 * - What to cut (pauses, ums, false starts, dead air, repeats)
 * - Where the best hook is (for the opening)
 * - A suggested caption for the reel
 *
 * Returns an EditDecisionList that drives the Remotion composition.
 */

import type { Caption } from "@remotion/captions";
import type { EditDecisionList } from "../src/types";

const SYSTEM_PROMPT = `You are an expert short-form video editor for Instagram Reels. You receive a transcript with word-level timestamps from a raw talking head video.

Your job is to produce an Edit Decision List (EDL) that transforms the raw footage into a tight, engaging reel.

RULES:
1. KEEP all substantive content — the speaker's points, stories, insights.
2. CUT:
   - Pauses longer than 800ms between words
   - Dead air at the start (before first word) and end (after last word) of the recording
   - Clear false starts where the speaker restarts the same sentence
   - Repeated phrases where the speaker says the same thing twice
   - Standalone filler clusters ("um", "uh", "like uh") that aren't part of a flowing sentence
3. DO NOT cut:
   - Single filler words embedded in a flowing sentence (e.g. "I like thought about it") — removing these creates unnatural jumps
   - Short pauses under 800ms — these are natural speech rhythm
4. HOOK — identify the most compelling 3-8 second segment. Note it but do NOT reorder.
5. Target 15-90 seconds. If good content runs longer, keep it.
6. IMPORTANT — word boundary alignment:
   - Start each keep segment at the EXACT startMs of the first word in that segment.
   - End each keep segment at the EXACT endMs of the last word in that segment.
   - Do NOT add padding — we handle that in post-processing.
7. The last keep segment should include the speaker's final word.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown:
{
  "keeps": [
    { "startMs": 0, "endMs": 5000, "reason": "content" }
  ],
  "cuts": [
    { "startMs": 5000, "endMs": 5800, "reason": "silence" }
  ],
  "hookSegment": { "startMs": 2000, "endMs": 6000, "reason": "hook" },
  "estimatedDurationMs": 45000,
  "summary": "Brief summary of what the speaker talks about",
  "suggestedCaption": "Instagram caption suggestion with relevant hashtags"
}

Reasons for keeps: "content", "hook", "punchline", "transition"
Reasons for cuts: "silence", "filler", "false_start", "repeat", "dead_air"`;

export async function analyse(
  captions: Caption[],
  fullText: string,
  videoDurationMs: number
): Promise<EditDecisionList> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Add it to .env"
    );
  }

  // Build the transcript with timestamps for Claude
  const timestampedTranscript = captions
    .map(
      (w) =>
        `[${formatMs(w.startMs)}-${formatMs(w.endMs)}] ${w.text.trim()}`
    )
    .join("\n");

  const userPrompt = `Here is a raw talking head video transcript with word-level timestamps.

Total video duration: ${formatMs(videoDurationMs)} (${videoDurationMs}ms)

TRANSCRIPT:
${timestampedTranscript}

FULL TEXT:
${fullText}

Analyse this and produce the EDL. Remember: respond with ONLY valid JSON. Use exact word-boundary timestamps from the transcript above.`;

  console.log("  → Sending to Claude for analysis...");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} — ${error}`);
  }

  const result = await response.json();
  const textContent = result.content?.find(
    (c: { type: string }) => c.type === "text"
  );

  if (!textContent?.text) {
    throw new Error("No text response from Claude");
  }

  // Parse the JSON — strip any accidental markdown fencing
  const jsonStr = textContent.text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  const edl: EditDecisionList = JSON.parse(jsonStr);

  // ── Validation & safety checks ──
  if (!edl.keeps || edl.keeps.length === 0) {
    // If Claude returns no keeps, keep everything (fail safe)
    console.warn("  ⚠ Claude returned no keep segments — keeping entire video");
    edl.keeps = [{ startMs: 0, endMs: videoDurationMs, reason: "content" }];
  }

  // Sort keeps by start time
  edl.keeps.sort((a, b) => a.startMs - b.startMs);

  // Merge adjacent keeps that overlap or are very close (<250ms gap)
  const merged = [edl.keeps[0]];
  for (let i = 1; i < edl.keeps.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = edl.keeps[i];
    if (curr.startMs - prev.endMs < 250) {
      prev.endMs = Math.max(prev.endMs, curr.endMs);
    } else {
      merged.push(curr);
    }
  }
  edl.keeps = merged;

  // Clamp to video bounds
  edl.keeps[0].startMs = Math.max(0, edl.keeps[0].startMs);
  edl.keeps[edl.keeps.length - 1].endMs = Math.min(
    videoDurationMs,
    edl.keeps[edl.keeps.length - 1].endMs
  );

  // Ensure the last segment extends a bit past the final word for a natural tail
  const lastKeep = edl.keeps[edl.keeps.length - 1];
  const lastCaption = [...captions]
    .reverse()
    .find((w) => w.startMs < lastKeep.endMs);
  if (lastCaption) {
    lastKeep.endMs = Math.min(
      videoDurationMs,
      Math.max(lastKeep.endMs, lastCaption.endMs + 400)
    );
  }

  // Recalculate duration
  edl.estimatedDurationMs = edl.keeps.reduce(
    (sum, seg) => sum + (seg.endMs - seg.startMs),
    0
  );

  console.log(
    `  → EDL: ${edl.keeps.length} segments, ~${Math.round(edl.estimatedDurationMs / 1000)}s output`
  );

  return edl;
}

/** Format milliseconds as MM:SS.mmm */
function formatMs(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}
