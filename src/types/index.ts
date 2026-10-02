// ============================================================
// StudyForge — Shared Type Definitions
// ============================================================

// ---- Module 1: YouTube Transcript ----

export interface TranscriptSegment {
  text: string;
  offset: number;   // ms from video start
  duration: number;  // ms
}

export interface CachedTranscript {
  videoId: string;
  title?: string;
  segments: TranscriptSegment[];
  fullText: string;
  fetchedAt: number; // epoch ms
}

export type TranscriptError = "no_captions" | "rate_limited" | "invalid_url" | "unknown";

export interface TranscriptApiResponse {
  success: boolean;
  data?: {
    segments: TranscriptSegment[];
    fullText: string;
  };
  error?: {
    type: TranscriptError;
    message: string;
  };
}

// ---- Module 2: PYQ Analyzer ----

export interface PyqDocument {
  id?: number;
  filename: string;
  fileType: "pdf" | "image";
  year?: string;
  extractionMethod: "pdfjs" | "ocr";
  rawText: string;
  pageCount: number;
  uploadedAt: number;
}

export interface PyqQuestion {
  id?: number;
  documentId: number;
  text: string;
  normalizedText: string;
  sourceFile: string;
  year?: string;
  moduleTag?: string;
  marks?: number;
  questionNumber?: string;
  embedding?: number[];
}

export interface QuestionCluster {
  id?: number;
  representative: string;
  questionIds: number[];
  frequency: number;
  years: string[];
  sourceFiles: string[];
  matchType: "exact" | "semantic";
  avgSimilarity: number;
}

export interface ExtractionResult {
  text: string;
  pageCount: number;
  isEmpty: boolean;
  method: "pdfjs" | "ocr";
}

export interface ProcessingProgress {
  stage: "extracting" | "ocr" | "segmenting" | "embedding" | "clustering" | "done" | "error";
  current: number;
  total: number;
  message: string;
}

// ---- Module 3: Flashcards ----

export interface Deck {
  id?: number;
  name: string;
  courseTag?: string;
  description?: string;
  cardCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Flashcard {
  id?: number;
  deckId: number;
  front: string;
  back: string;
  // SM-2 state
  repetition: number;
  easeFactor: number;
  interval: number;       // days
  nextReview: number;      // epoch ms
  lastReview?: number;     // epoch ms
  createdAt: number;
}

export interface ReviewLog {
  id?: number;
  cardId: number;
  deckId: number;
  quality: SM2Quality;
  previousInterval: number;
  newInterval: number;
  reviewedAt: number;
}

export type SM2Quality = 0 | 1 | 2 | 3 | 4 | 5;

export interface SM2Result {
  interval: number;
  repetition: number;
  easeFactor: number;
}

export interface ReviewStats {
  totalCards: number;
  dueToday: number;
  reviewedToday: number;
  averageEase: number;
  retentionRate: number;
}

export interface DeckStats {
  deckId: number;
  deckName: string;
  totalCards: number;
  dueToday: number;
  masteredCards: number;
  averageEase: number;
  dailyReviews: { date: string; count: number; correct: number }[];
}

// ---- Worker Messages ----

export interface OcrWorkerMessage {
  type: "process";
  imageData: ArrayBuffer;
  pageIndex: number;
}

export interface OcrWorkerResponse {
  type: "progress" | "result" | "error";
  pageIndex?: number;
  text?: string;
  progress?: number;
  error?: string;
}

export interface EmbeddingWorkerMessage {
  type: "embed";
  texts: string[];
  batchId: number;
}

export interface EmbeddingWorkerResponse {
  type: "progress" | "result" | "error" | "ready";
  batchId?: number;
  embeddings?: number[][];
  progress?: number;
  message?: string;
  error?: string;
}
