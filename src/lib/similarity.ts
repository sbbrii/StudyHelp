import { distance } from "fastest-levenshtein";

/**
 * Normalize text for comparison: lowercase, strip punctuation, collapse whitespace.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Levenshtein-based similarity score (0–1).
 * Uses fastest-levenshtein for O(n*m) edit distance.
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);

  if (normA === normB) return 1;
  if (normA.length === 0 || normB.length === 0) return 0;

  const maxLen = Math.max(normA.length, normB.length);
  const dist = distance(normA, normB);

  return 1 - dist / maxLen;
}

/**
 * Cosine similarity between two embedding vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Default thresholds for duplicate detection.
 */
export const SIMILARITY_THRESHOLDS = {
  nearExact: 0.85,
  semantic: 0.75,
} as const;
