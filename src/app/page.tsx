"use client";

import React, { useState } from "react";
import { TranscriptModule } from "@/components/TranscriptModule";
import { PyqModule } from "@/components/PyqModule";
import { FlashcardsModule } from "@/components/FlashcardsModule";
import {
  FileText,
  Layers,
  BookOpen,
  Sparkles,
  ShieldCheck,
  HardDrive,
  Cpu,
} from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"transcript" | "pyq" | "flashcards">(
    "transcript"
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              E
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500 bg-clip-text text-transparent">
                  EchoPrep
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
                  StudyForge
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 hidden sm:block">
                AI Exam Preparation Stack • 100% Free & Local
              </p>
            </div>
          </div>

          {/* Quick Badges */}
          <div className="hidden md:flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Zero Paid APIs
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-blue-500" /> Dexie IndexedDB
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-purple-500" /> Web Workers
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-2 -mb-px">
            <button
              onClick={() => setActiveTab("transcript")}
              className={`py-3 px-4 border-b-2 font-medium text-xs sm:text-sm flex items-center gap-2 transition-all ${
                activeTab === "transcript"
                  ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
              }`}
            >
              <FileText className="w-4 h-4" />
              1. YouTube Transcript Extractor
            </button>

            <button
              onClick={() => setActiveTab("pyq")}
              className={`py-3 px-4 border-b-2 font-medium text-xs sm:text-sm flex items-center gap-2 transition-all ${
                activeTab === "pyq"
                  ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
              }`}
            >
              <Layers className="w-4 h-4" />
              2. PYQ Question Analyzer
            </button>

            <button
              onClick={() => setActiveTab("flashcards")}
              className={`py-3 px-4 border-b-2 font-medium text-xs sm:text-sm flex items-center gap-2 transition-all ${
                activeTab === "flashcards"
                  ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              3. Flashcards (SM-2)
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "transcript" && <TranscriptModule />}
        {activeTab === "pyq" && <PyqModule />}
        {activeTab === "flashcards" && <FlashcardsModule />}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span>
              EchoPrep • Built with Next.js, Transformers.js, Tesseract.js & Dexie.js
            </span>
          </div>
          <div>All study data remains strictly on your device in IndexedDB.</div>
        </div>
      </footer>
    </div>
  );
}
