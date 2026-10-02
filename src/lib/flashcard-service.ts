import { db } from "./db";
import { sm2, getNextReviewDate, isDue, qualityFromLabel, DEFAULT_SM2_STATE } from "./sm2";
import { deckSchema, flashcardSchema } from "./validators";
import type { Flashcard, ReviewStats, DeckStats } from "@/types";

/**
 * Create a new Deck in Dexie.
 */
export async function createDeck(data: {
  name: string;
  courseTag?: string;
  description?: string;
}): Promise<number> {
  const validated = deckSchema.parse(data);
  const now = Date.now();
  const deckId = await db.decks.add({
    name: validated.name,
    courseTag: validated.courseTag,
    description: validated.description,
    cardCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  return deckId as number;
}

/**
 * Delete a deck and all associated cards and logs.
 */
export async function deleteDeck(deckId: number): Promise<void> {
  await db.transaction("rw", [db.decks, db.flashcards, db.reviewLogs], async () => {
    await db.flashcards.where("deckId").equals(deckId).delete();
    await db.reviewLogs.where("deckId").equals(deckId).delete();
    await db.decks.delete(deckId);
  });
}

/**
 * Create a single flashcard in a deck.
 */
export async function createCard(
  deckId: number,
  front: string,
  back: string
): Promise<number> {
  flashcardSchema.parse({ deckId, front, back });

  const cardId = await db.flashcards.add({
    deckId,
    front: front.trim(),
    back: back.trim(),
    ...DEFAULT_SM2_STATE,
    nextReview: Date.now(),
    createdAt: Date.now(),
  });

  // Update deck cardCount
  const count = await db.flashcards.where("deckId").equals(deckId).count();
  await db.decks.update(deckId, { cardCount: count, updatedAt: Date.now() });

  return cardId as number;
}

/**
 * Delete a single card.
 */
export async function deleteCard(cardId: number): Promise<void> {
  const card = await db.flashcards.get(cardId);
  if (!card) return;

  await db.flashcards.delete(cardId);
  const count = await db.flashcards.where("deckId").equals(card.deckId).count();
  await db.decks.update(card.deckId, { cardCount: count, updatedAt: Date.now() });
}

/**
 * Bulk import cards into a deck (from CSV or PYQ clusters).
 */
export async function bulkImportCards(
  deckId: number,
  cards: { front: string; back: string }[]
): Promise<number> {
  if (cards.length === 0) return 0;

  const validCards = cards
    .map((c) => ({
      deckId,
      front: c.front.trim(),
      back: c.back.trim(),
      ...DEFAULT_SM2_STATE,
      nextReview: Date.now(),
      createdAt: Date.now(),
    }))
    .filter((c) => c.front.length > 0 && c.back.length > 0);

  await db.flashcards.bulkAdd(validCards);

  const total = await db.flashcards.where("deckId").equals(deckId).count();
  await db.decks.update(deckId, { cardCount: total, updatedAt: Date.now() });

  return validCards.length;
}

/**
 * Submit an SM-2 rating ("again", "hard", "good", "easy") for a card.
 */
export async function reviewCard(
  card: Flashcard,
  rating: "again" | "hard" | "good" | "easy"
): Promise<Flashcard> {
  const quality = qualityFromLabel(rating);
  const result = sm2(quality, card.repetition, card.easeFactor, card.interval);
  const nextReview = getNextReviewDate(result.interval);
  const now = Date.now();

  const updatedCard: Flashcard = {
    ...card,
    repetition: result.repetition,
    easeFactor: result.easeFactor,
    interval: result.interval,
    nextReview,
    lastReview: now,
  };

  await db.flashcards.update(card.id!, {
    repetition: result.repetition,
    easeFactor: result.easeFactor,
    interval: result.interval,
    nextReview,
    lastReview: now,
  });

  await db.reviewLogs.add({
    cardId: card.id!,
    deckId: card.deckId,
    quality,
    previousInterval: card.interval,
    newInterval: result.interval,
    reviewedAt: now,
  });

  return updatedCard;
}

/**
 * Get all due cards for review (optionally filtered by deck).
 */
export async function getDueCards(deckId?: number): Promise<Flashcard[]> {
  const cards = deckId
    ? await db.flashcards.where("deckId").equals(deckId).toArray()
    : await db.flashcards.toArray();

  return cards.filter((c) => isDue(c.nextReview));
}

/**
 * Compute global review and retention statistics.
 */
export async function getGlobalStats(): Promise<ReviewStats> {
  const allCards = await db.flashcards.toArray();
  const totalCards = allCards.length;
  const dueToday = allCards.filter((c) => isDue(c.nextReview)).length;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const logsToday = await db.reviewLogs
    .where("reviewedAt")
    .aboveOrEqual(startOfDay.getTime())
    .toArray();

  const reviewedToday = logsToday.length;

  let averageEase = 2.5;
  if (totalCards > 0) {
    const sumEase = allCards.reduce((acc, c) => acc + c.easeFactor, 0);
    averageEase = Math.round((sumEase / totalCards) * 100) / 100;
  }

  // Retention rate: percentage of reviews with quality >= 3 (successful recall)
  const allLogs = await db.reviewLogs.toArray();
  let retentionRate = 100;
  if (allLogs.length > 0) {
    const successfulRecalls = allLogs.filter((l) => l.quality >= 3).length;
    retentionRate = Math.round((successfulRecalls / allLogs.length) * 100);
  }

  return {
    totalCards,
    dueToday,
    reviewedToday,
    averageEase,
    retentionRate,
  };
}

/**
 * Compute deck-specific statistics.
 */
export async function getDeckStats(deckId: number): Promise<DeckStats | null> {
  const deck = await db.decks.get(deckId);
  if (!deck) return null;

  const cards = await db.flashcards.where("deckId").equals(deckId).toArray();
  const totalCards = cards.length;
  const dueToday = cards.filter((c) => isDue(c.nextReview)).length;
  // Mastered: interval >= 21 days (roughly 3 weeks retention)
  const masteredCards = cards.filter((c) => c.interval >= 21).length;

  let averageEase = 2.5;
  if (totalCards > 0) {
    const sumEase = cards.reduce((acc, c) => acc + c.easeFactor, 0);
    averageEase = Math.round((sumEase / totalCards) * 100) / 100;
  }

  return {
    deckId,
    deckName: deck.name,
    totalCards,
    dueToday,
    masteredCards,
    averageEase,
    dailyReviews: [],
  };
}
