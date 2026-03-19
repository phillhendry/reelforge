/**
 * Caption Pipeline
 *
 * 1. remapCaptionsToEdl() — converts source timestamps to the output timeline
 * 2. padEdlForPlayback() — adds breathing room to EDL keeps
 * 3. detectEmphasis() — marks words for emphasis based on delivery cues
 */

import type { Caption } from "@remotion/captions";
import type { EditDecisionList, EditSegment } from "../src/types";

/**
 * Remap source-timeline captions to the output timeline based on EDL keeps.
 * Only captions whose startMs falls within a keep segment are included.
 */
export function remapCaptionsToEdl(
  captions: Caption[],
  edl: EditDecisionList
): Caption[] {
  const keeps = [...edl.keeps].sort((a, b) => a.startMs - b.startMs);
  const remapped: Caption[] = [];
  let outputOffsetMs = 0;

  for (const segment of keeps) {
    const segmentDuration = segment.endMs - segment.startMs;

    for (const caption of captions) {
      if (caption.startMs >= segment.startMs && caption.startMs < segment.endMs) {
        const offsetInSegment = caption.startMs - segment.startMs;
        const newStartMs = outputOffsetMs + offsetInSegment;
        const newEndMs = Math.min(
          outputOffsetMs + (caption.endMs - segment.startMs),
          outputOffsetMs + segmentDuration
        );

        remapped.push({
          ...caption,
          startMs: newStartMs,
          endMs: newEndMs,
          timestampMs: newStartMs + Math.round((newEndMs - newStartMs) / 2),
        });
      }
    }

    outputOffsetMs += segmentDuration;
  }

  return remapped;
}

/**
 * Pad EDL keeps for natural video playback.
 * Adds 80ms before (consonant onset) and 150ms after (word tail).
 */
export function padEdlForPlayback(
  edl: EditDecisionList,
  videoDurationMs: number
): EditDecisionList {
  const paddedKeeps: EditSegment[] = edl.keeps.map((seg) => ({
    ...seg,
    startMs: Math.max(0, seg.startMs - 80),
    endMs: Math.min(videoDurationMs, seg.endMs + 150),
  }));

  // Re-merge overlapping segments
  const merged: EditSegment[] = [paddedKeeps[0]];
  for (let i = 1; i < paddedKeeps.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = paddedKeeps[i];
    if (curr.startMs <= prev.endMs) {
      prev.endMs = Math.max(prev.endMs, curr.endMs);
    } else {
      merged.push(curr);
    }
  }

  const estimatedDurationMs = merged.reduce(
    (sum, seg) => sum + (seg.endMs - seg.startMs),
    0
  );

  return { ...edl, keeps: merged, estimatedDurationMs };
}

/** A caption with emphasis metadata attached */
export interface EmphasisCaption extends Caption {
  emphasis: "strong" | "moderate" | "normal";
}

/**
 * Detect which words should be emphasised based on delivery cues:
 *
 * - Words spoken slowly (long duration relative to character count) = speaker
 *   is stressing them → strong emphasis
 * - Words after a pause (>300ms gap from previous word) = deliberate delivery
 *   → moderate emphasis
 * - First word of a sentence = natural stress point → moderate emphasis
 * - Short common words (the, a, is, etc.) = never emphasised
 */
export function detectEmphasis(captions: Caption[]): EmphasisCaption[] {
  if (captions.length === 0) return [];

  // Common unstressed words that should never be emphasised
  const UNSTRESSED = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "and", "but", "or", "nor", "not", "so", "yet",
    "both", "either", "neither", "it", "its", "this", "that", "these",
    "those", "i", "me", "my", "we", "us", "our", "you", "your", "he",
    "him", "his", "she", "her", "they", "them", "their", "what", "which",
    "who", "whom", "how", "if", "then", "than", "um", "uh", "like",
    "just", "also", "very", "really", "about", "up", "out", "no", "yes",
  ]);

  // Calculate median ms-per-character to find words spoken unusually slowly
  const msPerChar = captions.map((c) => {
    const chars = c.text.trim().length;
    return chars > 0 ? (c.endMs - c.startMs) / chars : 0;
  }).filter((v) => v > 0);
  msPerChar.sort((a, b) => a - b);
  const median = msPerChar[Math.floor(msPerChar.length / 2)] || 80;
  const slowThreshold = median * 1.8; // 80% slower than median = stressed

  return captions.map((cap, i) => {
    const word = cap.text.trim().toLowerCase().replace(/[^a-z']/g, "");
    const chars = word.length;
    const durationMs = cap.endMs - cap.startMs;
    const prevCap = i > 0 ? captions[i - 1] : null;

    // Skip unstressed words
    if (UNSTRESSED.has(word) || chars <= 1) {
      return { ...cap, emphasis: "normal" as const };
    }

    // Strong: word spoken slowly (speaker is stressing it)
    if (chars > 0 && durationMs / chars > slowThreshold) {
      return { ...cap, emphasis: "strong" as const };
    }

    // Moderate: first word after a significant pause (>300ms)
    if (prevCap && cap.startMs - prevCap.endMs > 300) {
      return { ...cap, emphasis: "moderate" as const };
    }

    // Moderate: first word of a sentence (previous word ends with . ! ?)
    if (prevCap && /[.!?]$/.test(prevCap.text.trim())) {
      return { ...cap, emphasis: "moderate" as const };
    }

    return { ...cap, emphasis: "normal" as const };
  });
}
