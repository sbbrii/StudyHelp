import Dexie, { type Table } from "dexie";
import type {
  CachedTranscript,
  PyqDocument,
  PyqQuestion,
  QuestionCluster,
  Deck,
  Flashcard,
  ReviewLog,
} from "@/types";

export class StudyForgeDB extends Dexie {
  transcripts!: Table<CachedTranscript, string>;
  pyqDocuments!: Table<PyqDocument, number>;
  pyqQuestions!: Table<PyqQuestion, number>;
  questionClusters!: Table<QuestionCluster, number>;
  decks!: Table<Deck, number>;
  flashcards!: Table<Flashcard, number>;
  reviewLogs!: Table<ReviewLog, number>;

  constructor() {
    super("StudyForgeDB");

    this.version(1).stores({
      transcripts: "videoId, fetchedAt",
      pyqDocuments: "++id, filename, year",
      pyqQuestions: "++id, documentId, moduleTag, year",
      questionClusters: "++id, frequency",
      decks: "++id, name, courseTag",
      flashcards: "++id, deckId, nextReview",
      reviewLogs: "++id, cardId, deckId, reviewedAt",
    });
  }
}

export const db = new StudyForgeDB();
