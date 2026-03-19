// ============================================================
// ReelForge Types
// The data contracts between every stage of the pipeline.
// ============================================================

// Re-export Remotion's native caption types — these are the source of truth
// for all caption data flowing through the pipeline.
export type { Caption, TikTokPage, TikTokToken } from "@remotion/captions";

/** A segment of the original video to keep */
export interface EditSegment {
  startMs: number;
  endMs: number;
  reason: "content" | "hook" | "punchline" | "transition";
}

/** A segment to cut (dead air, filler, false starts) */
export interface CutSegment {
  startMs: number;
  endMs: number;
  reason: "silence" | "filler" | "false_start" | "repeat" | "dead_air";
}

/** The complete edit decision list from Claude analysis */
export interface EditDecisionList {
  /** Segments to keep, in order */
  keeps: EditSegment[];
  /** Segments to remove */
  cuts: CutSegment[];
  /** Suggested hook segment (best opening) */
  hookSegment?: EditSegment;
  /** Total estimated output duration in ms */
  estimatedDurationMs: number;
  /** Summary of what was said */
  summary: string;
  /** Suggested caption/title for the reel */
  suggestedCaption: string;
}

/** Source format detection */
export type AspectMode = "portrait" | "landscape" | "square";

/** Video metadata extracted from the source file */
export interface SourceMetadata {
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  aspectMode: AspectMode;
  filePath: string;
}

/** Brand configuration */
export interface BrandConfig {
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  captionStyle: "highlight" | "bounce" | "typewriter" | "minimal";
  showIntro: boolean;
  showOutro: boolean;
  introText?: string;
  outroText?: string;
  logoPath?: string;
}

/** The complete input props for the TalkingHead composition */
export interface TalkingHeadProps {
  /** Path to the source video file */
  sourceVideo: string;
  /** Remotion Caption[] — word-level timestamps from transcription */
  captions: import("@remotion/captions").Caption[];
  /** Edit decision list — which segments to keep */
  edl: EditDecisionList;
  /** Source video metadata */
  metadata: SourceMetadata;
  /** Brand configuration */
  brand: BrandConfig;
  /** Output dimensions */
  outputWidth: number;
  outputHeight: number;
  /** Output FPS */
  outputFps: number;
}

/** Carousel slide data */
export interface CarouselSlide {
  headline: string;
  body?: string;
  backgroundColor?: string;
  backgroundImage?: string;
  icon?: string;
  slideNumber: number;
  totalSlides: number;
}

/** Input props for the CarouselReel composition */
export interface CarouselReelProps {
  slides: CarouselSlide[];
  brand: BrandConfig;
  /** Seconds per slide (default 4) */
  secondsPerSlide: number;
  /** Background music path (optional) */
  musicPath?: string;
  outputWidth: number;
  outputHeight: number;
  outputFps: number;
}

/** Pipeline status for progress tracking */
export interface PipelineStatus {
  stage: "ingest" | "transcribe" | "analyse" | "render" | "complete" | "error";
  progress: number; // 0-100
  message: string;
  startedAt: number;
  completedAt?: number;
  outputPath?: string;
  error?: string;
}
