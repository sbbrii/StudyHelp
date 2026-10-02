"use client";

import React, { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  getYouTubeTranscript,
  formatTimestamp,
  TranscriptServiceError,
} from "@/lib/transcript-service";
import { downloadFile } from "@/lib/export";
import type { CachedTranscript } from "@/types";
import {
  Search,
  Copy,
  Check,
  Download,
  AlertCircle,
  Clock,
  Database,
  ExternalLink,
  RefreshCw,
  FileText,
} from "lucide-react";

export function TranscriptModule() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTranscript, setActiveTranscript] =
    useState<CachedTranscript | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [errorInfo, setErrorInfo] = useState<{
    type: "no_captions" | "rate_limited" | "invalid_url" | "unknown";
    message: string;
  } | null>(null);

  // Subscribe to all cached transcripts in Dexie
  const cachedHistory = useLiveQuery(
    () => db.transcripts.orderBy("fetchedAt").reverse().limit(10).toArray(),
    []
  );

  async function handleFetch(urlToFetch?: string) {
    const targetUrl = urlToFetch || url;
    if (!targetUrl.trim()) return;

    setLoading(true);
    setErrorInfo(null);
    setCopied(false);

    try {
      const result = await getYouTubeTranscript(targetUrl);
      setActiveTranscript({
        videoId: result.videoId,
        segments: result.segments,
        fullText: result.fullText,
        fetchedAt: result.fetchedAt,
      });
      setIsFromCache(result.fromCache);
    } catch (err: unknown) {
      if (err instanceof TranscriptServiceError) {
        setErrorInfo({
          type: err.type,
          message: err.message,
        });
      } else {
        setErrorInfo({
          type: "unknown",
          message:
            err instanceof Error
              ? err.message
              : "Failed to fetch transcript.",
        });
      }
      setActiveTranscript(null);
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!activeTranscript) return;
    navigator.clipboard.writeText(activeTranscript.fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    if (!activeTranscript) return;
    const timestampedContent = activeTranscript.segments
      .map(
        (s) => `[${formatTimestamp(s.offset)}] ${s.text}`
      )
      .join("\n");

    downloadFile(
      timestampedContent,
      `transcript-${activeTranscript.videoId}.txt`,
      "text/plain"
    );
  }

  const filteredSegments = (activeTranscript?.segments || []).filter((s) =>
    s.text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Search Header Card */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-500" />
          YouTube Transcript Extractor
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Extract full transcripts with clickable timestamps. Automatically cached
          in IndexedDB for instant zero-latency repeat access without hitting YouTube.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleFetch();
          }}
          className="mt-5 flex flex-col sm:flex-row gap-3"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Paste YouTube URL (e.g. https://www.youtube.com/watch?v=...)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Extracting...
              </>
            ) : (
              "Extract Transcript"
            )}
          </button>
        </form>

        {/* Tailored Error States */}
        {errorInfo && (
          <div
            className={`mt-4 p-4 rounded-lg border flex items-start gap-3 text-sm ${
              errorInfo.type === "rate_limited"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
                : errorInfo.type === "no_captions"
                ? "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400"
                : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"
            }`}
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold uppercase tracking-wider text-xs">
                {errorInfo.type === "rate_limited" && "YouTube Rate-Limited / Blocked"}
                {errorInfo.type === "no_captions" && "No Subtitles Available"}
                {errorInfo.type === "invalid_url" && "Invalid Video URL"}
                {errorInfo.type === "unknown" && "Fetch Error"}
              </div>
              <div className="mt-1">{errorInfo.message}</div>
            </div>
          </div>
        )}
      </div>

      {/* Transcript Results Display */}
      {activeTranscript && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                Video ID: {activeTranscript.videoId}
              </span>
              {isFromCache ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded border border-emerald-500/20">
                  <Database className="w-3.5 h-3.5" />
                  Loaded from IndexedDB Cache
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 rounded border border-blue-500/20">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Freshly Fetched & Cached
                </span>
              )}
              <span className="text-xs text-zinc-400">
                {activeTranscript.segments.length} segments
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Text
                  </>
                )}
              </button>
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Download .txt
              </button>
              <a
                href={`https://www.youtube.com/watch?v=${activeTranscript.videoId}`}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs transition-colors"
                title="Open on YouTube"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Transcript internal filter */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search in transcript..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Timestamped Segment List */}
          <div className="max-h-[500px] overflow-y-auto space-y-2 pr-2 divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {filteredSegments.length === 0 ? (
              <div className="py-8 text-center text-sm text-zinc-400">
                No matching transcript segments found.
              </div>
            ) : (
              filteredSegments.map((segment, idx) => (
                <div
                  key={idx}
                  className="pt-2 flex items-start gap-3 text-sm group hover:bg-zinc-50 dark:hover:bg-zinc-800/40 p-2 rounded-lg transition-colors"
                >
                  <a
                    href={`https://www.youtube.com/watch?v=${activeTranscript.videoId}&t=${Math.floor(
                      segment.offset / 1000
                    )}s`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 flex-shrink-0"
                    title="Jump to time on YouTube"
                  >
                    <Clock className="w-3 h-3" />
                    {formatTimestamp(segment.offset)}
                  </a>
                  <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed">
                    {segment.text}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Cached History Section */}
      {cachedHistory && cachedHistory.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-500" />
            Cached Transcripts in Local Storage ({cachedHistory.length})
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Click any entry to view instantly from IndexedDB without network requests.
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {cachedHistory.map((item) => (
              <button
                key={item.videoId}
                onClick={() => {
                  setUrl(`https://www.youtube.com/watch?v=${item.videoId}`);
                  setActiveTranscript(item);
                  setIsFromCache(true);
                  setErrorInfo(null);
                }}
                className={`p-3 text-left rounded-lg border transition-all text-xs flex flex-col justify-between ${
                  activeTranscript?.videoId === item.videoId
                    ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30"
                }`}
              >
                <div className="font-mono font-medium text-zinc-900 dark:text-zinc-100 truncate w-full">
                  ID: {item.videoId}
                </div>
                <div className="mt-2 text-zinc-500 dark:text-zinc-400 text-[11px] flex justify-between">
                  <span>{item.segments.length} lines</span>
                  <span>{new Date(item.fetchedAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
