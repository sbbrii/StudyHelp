import type { SM2Quality, SM2Result } from "@/types";

/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Based on the SuperMemo 2 algorithm by Piotr Wozniak.
 * Public domain — no library dependency needed.
 *
 * @param quality - User's recall rating (0–5)
 *   0 = Complete blackout
 *   1 = Incorrect, but remembered upon seeing answer
 *   2 = Incorrect, but answer felt easy to recall
 *   3 = Correct with serious difficulty
 *   4 = Correct with some hesitation
 *   5 = Perfect recall
 * @param repetition - Number of consecutive correct recalls
 * @param easeFactor - Ease factor (≥ 1.3), starts at 2.5
 * @param interval - Current interval in days
 * @returns New SM-2 state
 */
export function sm2(
  quality: SM2Quality,
  repetition: number,
  easeFactor: number,
  interval: number
): SM2Result {
  let newRepetition: number;
  let newInterval: number;
  let newEaseFactor: number;

  if (quality < 3) {
    // Failed recall — reset
    newRepetition = 0;
    newInterval = 1;
    newEaseFactor = easeFactor; // EF stays the same on failure
  } else {
    // Successful recall
    newRepetition = repetition + 1;

    if (newRepetition === 1) {
      newInterval = 1;
    } else if (newRepetition === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * easeFactor);
    }

    // Update ease factor
    newEaseFactor =
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  }

  // Floor ease factor at 1.3
  if (newEaseFactor < 1.3) {
    newEaseFactor = 1.3;
  }

  return {
    interval: newInterval,
    repetition: newRepetition,
    easeFactor: Math.round(newEaseFactor * 100) / 100,
  };
}

/**
 * Calculate the next review date from an SM-2 result
 */
export function getNextReviewDate(interval: number): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Start of today
  return now.getTime() + interval * 24 * 60 * 60 * 1000;
}

/**
 * Check if a card is due for review
 */
export function isDue(nextReview: number): boolean {
  const today = new Date();
  today.setHours(23, 59, 59, 999); // End of today
  return nextReview <= today.getTime();
}

/**
 * Map UI button labels to SM-2 quality grades
 */
export function qualityFromLabel(
  label: "again" | "hard" | "good" | "easy"
): SM2Quality {
  switch (label) {
    case "again":
      return 0;
    case "hard":
      return 2;
    case "good":
      return 4;
    case "easy":
      return 5;
  }
}

/**
 * Default SM-2 state for a new card
 */
export const DEFAULT_SM2_STATE = {
  repetition: 0,
  easeFactor: 2.5,
  interval: 0,
  nextReview: Date.now(),
} as const;
