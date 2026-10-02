"use client";

import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { processPyqFiles } from "@/lib/pyq-pipeline";
import {
  exportClustersAsCSV,
  exportClustersAsJSON,
  clustersToFlashcards,
  downloadFile,
} from "@/lib/export";
import { bulkImportCards, createDeck } from "@/lib/flashcard-service";
import { multiFileUploadSchema } from "@/lib/validators";
import type { ProcessingProgress } from "@/types";
import {
  Upload,
  FileText,
  AlertCircle,
  Download,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronRight,
  BookOpen,
  CheckCircle2,
  Trash2,
  Cpu,
  RefreshCw,
} from "lucide-react";

export function PyqModule() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedClusterId, setExpandedClusterId] = useState<number | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [flashcardModalOpen, setFlashcardModalOpen] = useState(false);
  const [targetDeckName, setTargetDeckName] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState<number | "new">("new");
  const [importedNotice, setImportedNotice] = useState<string | null>(null);

  // Live queries from Dexie
  const existingClusters = useLiveQuery(
    () => db.questionClusters.orderBy("frequency").reverse().toArray(),
    []
  );

  const existingQuestions = useLiveQuery(
    () => db.pyqQuestions.toArray(),
    []
  );

  const existingDocs = useLiveQuery(
    () => db.pyqDocuments.orderBy("uploadedAt").reverse().toArray(),
    []
  );

  const decks = useLiveQuery(() => db.decks.toArray(), []);

  function handleFileSelect(files: FileList | null) {
    if (!files) return;
    const newFiles = Array.from(files);
    const combined = [...selectedFiles, ...newFiles];

    const validation = multiFileUploadSchema.safeParse({ files: combined });
    if (!validation.success) {
      setErrorMsg(
        validation.error.issues[0]?.message || "Invalid file selection"
      );
      return;
    }

    setErrorMsg(null);
    setSelectedFiles(combined);
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleStartProcessing() {
    if (selectedFiles.length === 0) return;

    setProcessing(true);
    setErrorMsg(null);
    setProgress({
      stage: "extracting",
      current: 0,
      total: selectedFiles.length,
      message: "Starting processing pipeline...",
    });

    try {
      await processPyqFiles(selectedFiles, {
        onProgress: (p) => setProgress(p),
      });
      setSelectedFiles([]);
    } catch (err: unknown) {
      console.error("PYQ processing error:", err);
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to process files."
      );
    } finally {
      setProcessing(false);
    }
  }

  async function handleClearAll() {
    if (
      !confirm(
        "Clear all processed PYQ documents, questions, and clusters from IndexedDB?"
      )
    )
      return;
    await db.pyqDocuments.clear();
    await db.pyqQuestions.clear();
    await db.questionClusters.clear();
  }

  function handleExportCSV() {
    if (!existingClusters || !existingQuestions) return;
    const csv = exportClustersAsCSV(existingClusters, existingQuestions);
    downloadFile(csv, `pyq-clusters-${Date.now()}.csv`, "text/csv");
  }

  function handleExportJSON() {
    if (!existingClusters || !existingQuestions) return;
    const json = exportClustersAsJSON(existingClusters, existingQuestions);
    downloadFile(
      json,
      `pyq-clusters-${Date.now()}.json`,
      "application/json"
    );
  }

  async function handleSendToFlashcards() {
    if (!existingClusters || existingClusters.length === 0) return;

    try {
      const cards = clustersToFlashcards(existingClusters);
      let deckId: number;

      if (selectedDeckId === "new") {
        const name = targetDeckName.trim() || `PYQ High Yield (${new Date().toLocaleDateString()})`;
        deckId = await createDeck({
          name,
          description: `Auto-generated from ${existingClusters.length} repeated exam questions.`,
        });
      } else {
        deckId = selectedDeckId;
      }

      const count = await bulkImportCards(deckId, cards);
      setImportedNotice(`Successfully imported ${count} cards to flashcards deck!`);
      setFlashcardModalOpen(false);
      setTimeout(() => setImportedNotice(null), 4000);
    } catch (err: unknown) {
      alert(
        "Failed to import cards: " +
          (err instanceof Error ? err.message : String(err))
      );
    }
  }

  const filteredClusters = (existingClusters || []).filter(
    (c) =>
      c.representative.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.sourceFiles.some((f) =>
        f.toLowerCase().includes(searchQuery.toLowerCase())
      ) ||
      c.years.some((y) => y.includes(searchQuery))
  );

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-500" />
              Previous Year Question (PYQ) Analyzer
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Upload multiple question papers (PDF or images). Automatically extracts text
              via pdf.js (with Tesseract.js OCR fallback), computes semantic embeddings in a Web Worker,
              and clusters questions by frequency.
            </p>
          </div>

          {existingDocs && existingDocs.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 self-start sm:self-center"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset Corpus ({existingDocs.length} papers)
            </button>
          )}
        </div>

        {/* Drag & Drop Area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFileSelect(e.dataTransfer.files);
          }}
          className={`mt-5 border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            isDragging
              ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20"
              : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-800/30"
          }`}
          onClick={() => document.getElementById("pyq-file-input")?.click()}
        >
          <input
            id="pyq-file-input"
            type="file"
            multiple
            accept=".pdf,image/png,image/jpeg,image/webp,image/tiff"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          <Upload className="w-10 h-10 mx-auto text-indigo-500/80 mb-3" />
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Click to upload or drag & drop question papers
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Supports PDF documents (scanned or digital) and Images (PNG, JPG, WebP) up to 20MB each
          </p>
        </div>

        {/* Selected Files Badge List */}
        {selectedFiles.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Selected Files ({selectedFiles.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedFiles.map((file, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700"
                >
                  <FileText className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="font-medium truncate max-w-[200px]">
                    {file.name}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    ({Math.round(file.size / 1024)} KB)
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(i);
                    }}
                    className="ml-1 text-zinc-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="pt-2">
              <button
                onClick={handleStartProcessing}
                disabled={processing}
                className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium text-sm transition-colors flex items-center gap-2 shadow-sm"
              >
                {processing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processing Corpus in Web Workers...
                  </>
                ) : (
                  <>
                    <Cpu className="w-4 h-4" />
                    Analyze & Cluster Questions
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Progress Display */}
        {progress && processing && (
          <div className="mt-5 p-4 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-indigo-900 dark:text-indigo-200">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Stage: {progress.stage.toUpperCase()}
              </span>
              <span>
                {progress.current} / {progress.total}
              </span>
            </div>
            <div className="w-full bg-indigo-200 dark:bg-indigo-900 h-2 rounded-full overflow-hidden">
              <div
                className="bg-indigo-600 h-full transition-all duration-300"
                style={{
                  width: `${
                    progress.total > 0
                      ? Math.min(
                          100,
                          Math.round((progress.current / progress.total) * 100)
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="text-xs text-indigo-700 dark:text-indigo-300">
              {progress.message}
            </p>
          </div>
        )}

        {/* Error notification */}
        {errorMsg && (
          <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success toast notification */}
        {importedNotice && (
          <div className="mt-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{importedNotice}</span>
          </div>
        )}
      </div>

      {/* Processed Corpus Documents Summary */}
      {existingDocs && existingDocs.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Cluster Results ({existingClusters?.length || 0} unique patterns from{" "}
                {existingQuestions?.length || 0} questions)
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Questions grouped across {existingDocs.length} papers using Tier 1
                (Levenshtein text distance) and Tier 2 (all-MiniLM-L6-v2 cosine similarity).
              </p>
            </div>

            {/* Export & Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button
                onClick={handleExportJSON}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </button>
              <button
                onClick={() => setFlashcardModalOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Send to Flashcards
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mt-4">
            <input
              type="text"
              placeholder="Filter questions by keywords, year, or source filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Ranked Table */}
          <div className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {filteredClusters.length === 0 ? (
              <div className="py-8 text-center text-sm text-zinc-400">
                No matching question clusters found.
              </div>
            ) : (
              filteredClusters.map((cluster, idx) => {
                const isExpanded = expandedClusterId === cluster.id;
                const matchedQuestions = (existingQuestions || []).filter((q) =>
                  cluster.questionIds.includes(q.id!)
                );

                return (
                  <div key={cluster.id || idx} className="py-3.5 space-y-2">
                    <div
                      className="flex items-start justify-between gap-4 cursor-pointer group"
                      onClick={() =>
                        setExpandedClusterId(isExpanded ? null : cluster.id!)
                      }
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                            #{idx + 1}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              cluster.frequency > 2
                                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                            }`}
                          >
                            Repeated {cluster.frequency}x
                          </span>
                          <span
                            className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                              cluster.matchType === "semantic"
                                ? "bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                                : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            }`}
                          >
                            {cluster.matchType === "semantic"
                              ? "Semantic Match"
                              : "Near-Exact"}
                            {" ("}
                            {Math.round(cluster.avgSimilarity * 100)}%
                            {")"}
                          </span>
                        </div>

                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex-1">
                          {cluster.representative}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {cluster.years.length > 0 && (
                          <span className="text-[11px] font-mono text-zinc-400 hidden sm:inline">
                            Years: {cluster.years.join(", ")}
                          </span>
                        )}
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-zinc-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-zinc-400" />
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="ml-8 mt-2 p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 text-xs space-y-3">
                        <div className="font-semibold text-zinc-700 dark:text-zinc-300">
                          Appeared in {matchedQuestions.length} exam question instances:
                        </div>
                        <div className="space-y-2">
                          {matchedQuestions.map((q, qIdx) => (
                            <div
                              key={q.id || qIdx}
                              className="p-2.5 rounded border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-900 space-y-1"
                            >
                              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                                <span className="font-medium text-zinc-600 dark:text-zinc-300">
                                  Source: {q.sourceFile}
                                </span>
                                <span>
                                  {q.year ? `Year ${q.year}` : ""}
                                  {q.marks ? ` • ${q.marks} Marks` : ""}
                                  {q.moduleTag ? ` • ${q.moduleTag}` : ""}
                                </span>
                              </div>
                              <p className="text-zinc-800 dark:text-zinc-200">
                                {q.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Send to Flashcards Modal */}
      {flashcardModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
              Export {existingClusters?.length} Questions to Flashcards
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Each question cluster will be converted into a flashcard with recurrence
              statistics and year citations on the back.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Target Deck
                </label>
                <select
                  value={selectedDeckId}
                  onChange={(e) =>
                    setSelectedDeckId(
                      e.target.value === "new" ? "new" : Number(e.target.value)
                    )
                  }
                  className="mt-1 w-full p-2.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                >
                  <option value="new">+ Create a New Deck</option>
                  {(decks || []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.cardCount} cards)
                    </option>
                  ))}
                </select>
              </div>

              {selectedDeckId === "new" && (
                <div>
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    New Deck Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. KTU CS301 PYQ High Yield"
                    value={targetDeckName}
                    onChange={(e) => setTargetDeckName(e.target.value)}
                    className="mt-1 w-full p-2.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFlashcardModalOpen(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendToFlashcards}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              >
                Confirm Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
