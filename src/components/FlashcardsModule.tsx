"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  createDeck,
  deleteDeck,
  createCard,
  deleteCard,
  bulkImportCards,
  reviewCard,
  getDueCards,
  getGlobalStats,
} from "@/lib/flashcard-service";
import { parseFlashcardCSV } from "@/lib/export";
import { isDue } from "@/lib/sm2";
import { deckSchema, flashcardSchema, csvImportSchema } from "@/lib/validators";
import type { Deck, Flashcard, ReviewStats } from "@/types";
import {
  BookOpen,
  Plus,
  Trash2,
  Upload,
  Play,
  CheckCircle,
  Clock,
  BarChart2,
  Layers,
  ArrowLeft,
} from "lucide-react";

export function FlashcardsModule() {
  const [activeView, setActiveView] = useState<
    "decks" | "cards" | "review"
  >("decks");
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);

  // Deck Creation Form state
  const [newDeckModal, setNewDeckModal] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [deckCourseTag, setDeckCourseTag] = useState("");
  const [deckDesc, setDeckDesc] = useState("");

  // Card Creation Form state
  const [newCardFront, setNewCardFront] = useState("");
  const [newCardBack, setNewCardBack] = useState("");

  // CSV Import Modal state
  const [csvModal, setCsvModal] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvTargetDeckId, setCsvTargetDeckId] = useState<number | null>(null);

  // Review Session state
  const [reviewCards, setReviewCards] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  // Error & Status message
  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);

  // Live queries
  const decks = useLiveQuery(() => db.decks.toArray(), []);
  const allCards = useLiveQuery(() => db.flashcards.toArray(), []);
  const currentDeckCards = useLiveQuery<Flashcard[]>(
    () =>
      selectedDeck?.id
        ? db.flashcards.where("deckId").equals(selectedDeck.id).toArray()
        : Promise.resolve<Flashcard[]>([]),
    [selectedDeck]
  );

  // Global stats state
  const [stats, setStats] = useState<ReviewStats>({
    totalCards: 0,
    dueToday: 0,
    reviewedToday: 0,
    averageEase: 2.5,
    retentionRate: 100,
  });

  useEffect(() => {
    getGlobalStats().then(setStats).catch(console.error);
  }, [allCards, activeView]);

  function notify(text: string, isError = false) {
    setStatusMsg({ text, isError });
    setTimeout(() => setStatusMsg(null), 4000);
  }

  // --- Handlers: Deck ---
  async function handleCreateDeck(e: React.FormEvent) {
    e.preventDefault();
    try {
      deckSchema.parse({
        name: deckName,
        courseTag: deckCourseTag || undefined,
        description: deckDesc || undefined,
      });

      await createDeck({
        name: deckName,
        courseTag: deckCourseTag || undefined,
        description: deckDesc || undefined,
      });

      setDeckName("");
      setDeckCourseTag("");
      setDeckDesc("");
      setNewDeckModal(false);
      notify("Deck created successfully!");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "issues" in err
          ? (err as { issues: { message: string }[] }).issues[0]?.message
          : err instanceof Error
          ? err.message
          : "Failed to create deck";
      notify(msg || "Failed to create deck", true);
    }
  }

  async function handleDeleteDeck(deckId: number) {
    if (!confirm("Delete this deck and all of its flashcards?")) return;
    await deleteDeck(deckId);
    if (selectedDeck?.id === deckId) {
      setSelectedDeck(null);
      setActiveView("decks");
    }
    notify("Deck deleted.");
  }

  // --- Handlers: Card ---
  async function handleAddCard(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDeck?.id) return;

    try {
      flashcardSchema.parse({
        deckId: selectedDeck.id,
        front: newCardFront,
        back: newCardBack,
      });

      await createCard(selectedDeck.id, newCardFront, newCardBack);
      setNewCardFront("");
      setNewCardBack("");
      notify("Flashcard added!");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "issues" in err
          ? (err as { issues: { message: string }[] }).issues[0]?.message
          : err instanceof Error
          ? err.message
          : "Failed to add card";
      notify(msg || "Failed to add card", true);
    }
  }

  async function handleDeleteCard(cardId: number) {
    await deleteCard(cardId);
    notify("Card removed.");
  }

  // --- Handlers: CSV Import ---
  async function handleCsvImport() {
    if (!csvTargetDeckId) {
      notify("Please select a target deck.", true);
      return;
    }

    try {
      const parsed = parseFlashcardCSV(csvText);
      csvImportSchema.parse(parsed);

      const count = await bulkImportCards(csvTargetDeckId, parsed);
      setCsvText("");
      setCsvModal(false);
      notify(`Imported ${count} flashcards successfully!`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "issues" in err
          ? (err as { issues: { message: string }[] }).issues[0]?.message
          : err instanceof Error
          ? err.message
          : "Failed to import CSV";
      notify(msg || "Failed to import CSV", true);
    }
  }

  // --- Handlers: Review Session ---
  async function startReviewSession(deckId?: number) {
    const due = await getDueCards(deckId);
    if (due.length === 0) {
      notify("No cards currently due for review in this deck! Great job.");
      return;
    }

    setReviewCards(due);
    setCurrentCardIndex(0);
    setIsAnswerRevealed(false);
    setSessionCompleted(false);
    setReviewedCount(0);
    setActiveView("review");
  }

  const handleRating = useCallback(
    async (label: "again" | "hard" | "good" | "easy") => {
      const currentCard = reviewCards[currentCardIndex];
      if (!currentCard) return;

      await reviewCard(currentCard, label);
      setReviewedCount((prev) => prev + 1);

      if (currentCardIndex + 1 < reviewCards.length) {
        setCurrentCardIndex((prev) => prev + 1);
        setIsAnswerRevealed(false);
      } else {
        setSessionCompleted(true);
      }
    },
    [reviewCards, currentCardIndex]
  );

  // Keyboard navigation for review session
  useEffect(() => {
    if (activeView !== "review" || sessionCompleted) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "Enter") {
        if (!isAnswerRevealed) {
          e.preventDefault();
          setIsAnswerRevealed(true);
        }
      } else if (isAnswerRevealed) {
        if (e.key === "1") handleRating("again");
        if (e.key === "2") handleRating("hard");
        if (e.key === "3") handleRating("good");
        if (e.key === "4") handleRating("easy");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeView, isAnswerRevealed, sessionCompleted, handleRating]);

  return (
    <div className="space-y-6">
      {/* Global Spaced Repetition Stats Banner */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-500" />
              SM-2 Spaced Repetition Flashcards
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Active recall powered by the SuperMemo-2 algorithm. All review history
              and interval calculations stored in IndexedDB.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setNewDeckModal(true)}
              className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Deck
            </button>
            <button
              onClick={() => {
                if (decks && decks.length > 0) {
                  setCsvTargetDeckId(decks[0].id!);
                }
                setCsvModal(true);
              }}
              className="px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </button>
          </div>
        </div>

        {/* 4 Stats Cards */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              Due Today
            </div>
            <div className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {stats.dueToday}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Ready for review
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              Reviewed Today
            </div>
            <div className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {stats.reviewedToday}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Completed today
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <BarChart2 className="w-3.5 h-3.5 text-indigo-500" />
              Retention Rate
            </div>
            <div className="mt-1 text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {stats.retentionRate}%
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Recall score ≥ 3
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
            <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-purple-500" />
              Total Cards
            </div>
            <div className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {stats.totalCards}
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Across {decks?.length || 0} decks
            </div>
          </div>
        </div>

        {/* Status notification */}
        {statusMsg && (
          <div
            className={`mt-4 p-3 rounded-lg text-xs font-medium ${
              statusMsg.isError
                ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
            }`}
          >
            {statusMsg.text}
          </div>
        )}
      </div>

      {/* VIEW 1: Decks List */}
      {activeView === "decks" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Your Decks ({decks?.length || 0})
            </h3>
            {stats.dueToday > 0 && (
              <button
                onClick={() => startReviewSession()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Study All Due Cards ({stats.dueToday})
              </button>
            )}
          </div>

          {!decks || decks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 p-12 text-center bg-white dark:bg-zinc-900">
              <BookOpen className="w-10 h-10 mx-auto text-zinc-400 mb-3" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                No flashcard decks yet.
              </p>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                Create a deck manually, import a CSV, or analyze exam papers in
                Module 2 to generate high-yield question cards.
              </p>
              <button
                onClick={() => setNewDeckModal(true)}
                className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium"
              >
                Create First Deck
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {decks.map((deck) => {
                const deckCards = (allCards || []).filter(
                  (c) => c.deckId === deck.id
                );
                const dueInDeck = deckCards.filter((c) =>
                  isDue(c.nextReview)
                ).length;

                return (
                  <div
                    key={deck.id}
                    className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex flex-col justify-between space-y-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">
                          {deck.name}
                        </h4>
                        {deck.courseTag && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                            {deck.courseTag}
                          </span>
                        )}
                      </div>
                      {deck.description && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 line-clamp-2">
                          {deck.description}
                        </p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">
                          {deck.cardCount}
                        </span>{" "}
                        cards
                        {dueInDeck > 0 && (
                          <span className="ml-2 font-semibold text-amber-600 dark:text-amber-400">
                            • {dueInDeck} due
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedDeck(deck);
                            setActiveView("cards");
                          }}
                          className="px-2.5 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
                        >
                          Cards
                        </button>
                        <button
                          onClick={() => startReviewSession(deck.id)}
                          disabled={dueInDeck === 0}
                          className="px-3 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-medium flex items-center gap-1 transition-colors"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          Study
                        </button>
                        <button
                          onClick={() => handleDeleteDeck(deck.id!)}
                          className="p-1 text-zinc-400 hover:text-red-500 rounded"
                          title="Delete Deck"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: Card Management inside a Deck */}
      {activeView === "cards" && selectedDeck && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setActiveView("decks")}
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Decks
            </button>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Managing Cards: {selectedDeck.name}
            </h3>
            <div className="w-20" />
          </div>

          {/* Add New Card Form */}
          <form
            onSubmit={handleAddCard}
            className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4"
          >
            <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
              Add New Flashcard
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Front (Question / Prompt)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. What is the difference between TCP and UDP?"
                  value={newCardFront}
                  onChange={(e) => setNewCardFront(e.target.value)}
                  className="mt-1 w-full p-2.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Back (Answer / Explanation)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. TCP is connection-oriented and reliable; UDP is connectionless and lightweight."
                  value={newCardBack}
                  onChange={(e) => setNewCardBack(e.target.value)}
                  className="mt-1 w-full p-2.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Save Card
            </button>
          </form>

          {/* Cards List */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Cards in Deck ({currentDeckCards?.length || 0})
            </div>
            {!currentDeckCards || currentDeckCards.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400 border border-dashed rounded-xl">
                No cards in this deck yet.
              </div>
            ) : (
              currentDeckCards.map((card) => (
                <div
                  key={card.id}
                  className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-start justify-between gap-4 text-xs"
                >
                  <div className="space-y-2 flex-1">
                    <div>
                      <span className="font-semibold text-zinc-500">Front: </span>
                      <span className="text-zinc-900 dark:text-zinc-100 font-medium">
                        {card.front}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-zinc-500">Back: </span>
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {card.back}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-zinc-400 pt-1 font-mono">
                      <span>Interval: {card.interval}d</span>
                      <span>Ease: {card.easeFactor}</span>
                      <span>Reps: {card.repetition}</span>
                      <span>
                        Next: {new Date(card.nextReview).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteCard(card.id!)}
                    className="p-1 text-zinc-400 hover:text-red-500 rounded"
                    title="Delete Card"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: Active Review Session */}
      {activeView === "review" && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setActiveView("decks")}
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Exit Review
            </button>
            <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Card {currentCardIndex + 1} of {reviewCards.length}
            </div>
            <div className="w-16" />
          </div>

          {sessionCompleted ? (
            <div className="p-12 text-center rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm space-y-4">
              <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
              <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                Session Completed!
              </h3>
              <p className="text-sm text-zinc-500 max-w-sm mx-auto">
                You reviewed {reviewedCount} cards. The SM-2 scheduling algorithm has updated
                all intervals accordingly.
              </p>
              <button
                onClick={() => setActiveView("decks")}
                className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-sm"
              >
                Back to Decks
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Flashcard Box */}
              <div
                className="min-h-[260px] p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-md flex flex-col justify-between cursor-pointer"
                onClick={() => {
                  if (!isAnswerRevealed) setIsAnswerRevealed(true);
                }}
              >
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500 flex items-center gap-1">
                    Question / Prompt
                  </div>
                  <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50 leading-relaxed">
                    {reviewCards[currentCardIndex]?.front}
                  </p>
                </div>

                {isAnswerRevealed ? (
                  <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500">
                      Answer / Explanation
                    </div>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                      {reviewCards[currentCardIndex]?.back}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsAnswerRevealed(true);
                      }}
                      className="px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors"
                    >
                      Show Answer (Spacebar / Click)
                    </button>
                  </div>
                )}
              </div>

              {/* 4-point Rating Buttons */}
              {isAnswerRevealed ? (
                <div className="space-y-2">
                  <div className="text-center text-xs text-zinc-400">
                    Rate recall difficulty (Key: 1, 2, 3, 4):
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      onClick={() => handleRating("again")}
                      className="py-3 px-2 rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 text-xs font-semibold transition-colors flex flex-col items-center gap-1"
                    >
                      <span>Again (1)</span>
                      <span className="text-[10px] opacity-75">1 day</span>
                    </button>
                    <button
                      onClick={() => handleRating("hard")}
                      className="py-3 px-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-400 text-xs font-semibold transition-colors flex flex-col items-center gap-1"
                    >
                      <span>Hard (2)</span>
                      <span className="text-[10px] opacity-75">Shorter</span>
                    </button>
                    <button
                      onClick={() => handleRating("good")}
                      className="py-3 px-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-400 text-xs font-semibold transition-colors flex flex-col items-center gap-1"
                    >
                      <span>Good (3)</span>
                      <span className="text-[10px] opacity-75">Optimal</span>
                    </button>
                    <button
                      onClick={() => handleRating("easy")}
                      className="py-3 px-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400 text-xs font-semibold transition-colors flex flex-col items-center gap-1"
                    >
                      <span>Easy (4)</span>
                      <span className="text-[10px] opacity-75">Longer</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Modal: New Deck */}
      {newDeckModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateDeck}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 max-w-md w-full shadow-xl space-y-4"
          >
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              Create New Deck
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Deck Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Operating Systems Final"
                  value={deckName}
                  onChange={(e) => setDeckName(e.target.value)}
                  className="mt-1 w-full p-2.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Course Tag (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. CS304"
                  value={deckCourseTag}
                  onChange={(e) => setDeckCourseTag(e.target.value)}
                  className="mt-1 w-full p-2.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Short description..."
                  value={deckDesc}
                  onChange={(e) => setDeckDesc(e.target.value)}
                  className="mt-1 w-full p-2.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewDeckModal(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              >
                Create Deck
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: CSV Import */}
      {csvModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 max-w-lg w-full shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              Bulk Import Cards from CSV
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Paste CSV text with column headers &#34;front&#34; and &#34;back&#34;, or select a .csv file.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Target Deck *
                </label>
                <select
                  value={csvTargetDeckId || ""}
                  onChange={(e) => setCsvTargetDeckId(Number(e.target.value))}
                  className="mt-1 w-full p-2.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                >
                  {(decks || []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.cardCount} cards)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Upload CSV File
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const text = await file.text();
                      setCsvText(text);
                    }
                  }}
                  className="mt-1 block w-full text-xs text-zinc-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-zinc-100 dark:file:bg-zinc-800 file:text-zinc-700 dark:file:text-zinc-300"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Or Paste CSV Text
                </label>
                <textarea
                  rows={6}
                  placeholder={`front,back\n"What is DNS?","Domain Name System translates domain names to IP addresses."\n"What is HTTP?","HyperText Transfer Protocol"`}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  className="mt-1 w-full p-2.5 font-mono text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCsvModal(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCsvImport}
                disabled={!csvText.trim()}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm"
              >
                Import Cards
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
