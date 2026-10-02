import { z } from "zod";

// YouTube URL validation
const YOUTUBE_PATTERNS = [
  /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
  /(?:youtu\.be\/)([\w-]{11})/,
  /(?:youtube\.com\/embed\/)([\w-]{11})/,
  /(?:youtube\.com\/v\/)([\w-]{11})/,
  /(?:youtube\.com\/shorts\/)([\w-]{11})/,
];

export const youtubeUrlSchema = z
  .string()
  .min(1, "URL is required")
  .refine(
    (url) => YOUTUBE_PATTERNS.some((pattern) => pattern.test(url)),
    "Please enter a valid YouTube URL"
  );

export function extractVideoId(url: string): string | null {
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

// File upload validation
const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/tiff",
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export const fileUploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine(
      (file) => file.size <= MAX_FILE_SIZE,
      `File size must be less than 20MB`
    )
    .refine(
      (file) => ALLOWED_FILE_TYPES.includes(file.type),
      "File must be a PDF or image (PNG, JPG, WebP, TIFF)"
    ),
});

export const multiFileUploadSchema = z.object({
  files: z
    .array(
      z
        .instanceof(File)
        .refine((file) => file.size <= MAX_FILE_SIZE, `File too large (max 20MB)`)
        .refine(
          (file) => ALLOWED_FILE_TYPES.includes(file.type),
          "Invalid file type"
        )
    )
    .min(1, "At least one file is required")
    .max(20, "Maximum 20 files at once"),
});

// Flashcard validation
export const flashcardSchema = z.object({
  front: z
    .string()
    .min(1, "Front side is required")
    .max(2000, "Front side is too long (max 2000 chars)"),
  back: z
    .string()
    .min(1, "Back side is required")
    .max(5000, "Back side is too long (max 5000 chars)"),
  deckId: z.number().int().positive("Invalid deck"),
});

export const deckSchema = z.object({
  name: z
    .string()
    .min(1, "Deck name is required")
    .max(100, "Deck name is too long"),
  courseTag: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
});

// CSV import validation
export const csvRowSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
});

export const csvImportSchema = z
  .array(csvRowSchema)
  .min(1, "CSV must contain at least one row")
  .max(500, "Maximum 500 cards per import");

// Similarity thresholds
export const similarityConfigSchema = z.object({
  nearExactThreshold: z.number().min(0).max(1).default(0.85),
  semanticThreshold: z.number().min(0).max(1).default(0.75),
});

export type SimilarityConfig = z.infer<typeof similarityConfigSchema>;
