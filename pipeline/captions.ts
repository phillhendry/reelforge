/**
 * Caption Page Builder
 *
 * Groups word-level timestamps into "pages" — the groups of 3-6 words
 * that appear on screen together. This is the TikTok/Reels caption
 * style where words highlight one-by-one within a visible group.
 *
 * We roll our own here rather than using Remotion's
 * createTikTokStyleCaptions() so we have full control over grouping
 * logic — specifically, we want to break on natural phrase boundaries
 * rather than just timing windows.
 */

import type { CaptionWord, CaptionPage } from "../src/types";

interface BuildPagesOptions {
  /** Max words per page (default 5) */
  maxWordsPerPage?: number;
  /** Max duration for a page in ms (default 2500) */
  maxPageDurationMs?: number;
  /** Min gap between words to force a page break in ms (default 600) */
  silenceBreakMs?: number;
}

export function buildCaptionPages(
  words: CaptionWord[],
  options: BuildPagesOptions = {}
): CaptionPage[] {
  const {
    maxWordsPerPage = 5,
    maxPageDurationMs = 2500,
    silenceBreakMs = 600,
  } = options;

  if (words.length === 0) return [];

  const pages: CaptionPage[] = [];
  let currentPageWords: CaptionWord[] = [];

  const flushPage = () => {
    if (currentPageWords.length === 0) return;

    const page: CaptionPage = {
      text: currentPageWords.map((w) => w.text.trim()).join(" "),
      startMs: currentPageWords[0].startMs,
      endMs: currentPageWords[currentPageWords.length - 1].endMs,
      words: [...currentPageWords],
    };

    pages.push(page);
    currentPageWords = [];
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const prevWord = currentPageWords[currentPageWords.length - 1];

    // Decide whether to break to a new page
    let shouldBreak = false;

    // Hit max words
    if (currentPageWords.length >= maxWordsPerPage) {
      shouldBreak = true;
    }

    // Page duration exceeded
    if (
      currentPageWords.length > 0 &&
      word.endMs - currentPageWords[0].startMs > maxPageDurationMs
    ) {
      shouldBreak = true;
    }

    // Silence gap — natural pause
    if (prevWord && word.startMs - prevWord.endMs > silenceBreakMs) {
      shouldBreak = true;
    }

    // Break on sentence-ending punctuation in the previous word
    if (prevWord && /[.!?]$/.test(prevWord.text.trim())) {
      shouldBreak = true;
    }

    if (shouldBreak) {
      flushPage();
    }

    currentPageWords.push(word);
  }

  // Flush remaining
  flushPage();

  return pages;
}
