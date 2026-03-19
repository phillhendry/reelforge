// ============================================================
// ReelForge Types
// The data contracts between every stage of the pipeline.
// ============================================================

/** A single captioned word with precise timing */
export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

/** A page of captions (group of words shown together) */
export interface CaptionPage {
  text: string;
  startMs: number;
  endMs: number;
  words: CaptionWord[];
}

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
  /** Word-level caption data */
  captions: CaptionWord[];
  /** Caption pages for display */
  captionPages: CaptionPage[];
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
