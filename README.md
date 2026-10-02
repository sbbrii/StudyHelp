# EchoPrep (StudyForge)

> **Zero-Cost, Privacy-First Exam Preparation & Spaced Repetition Platform**  
> Runs entirely in the browser using client-side AI, Web Workers, and IndexedDB. **Zero paid API keys required.**

---

## Features & Modules

### 1. YouTube Transcript Extractor
* **Direct Transcript Extraction:** Fetches full subtitle and caption tracks via YouTube's public endpoints.
* **Timestamp Navigation:** Interactive, clickable timestamp markers linking directly to the corresponding seconds in the video.
* **Smart Error Classification:** Distinct error indicators distinguishing between:
  * Disabled / Unavailable subtitles (`no_captions`)
  * YouTube IP rate-limiting (`rate_limited`)
  * Invalid URLs or private videos (`invalid_url`)
* **Local IndexedDB Caching:** Successfully fetched transcripts are cached in IndexedDB by video ID to eliminate redundant network roundtrips.
* **Export Options:** One-click copy to clipboard and downloadable `.txt` files formatted with timestamp markers.

### 2. Previous Year Question (PYQ) Analyzer
* **Multi-File Processing:** Batch upload exam papers in PDF, PNG, JPG, or WebP formats up to 20MB.
* **Hybrid Text Extraction:**
  * Fast native digital PDF text extraction via `pdf.js`.
  * Automatic OCR fallback via `Tesseract.js` running in a dedicated Web Worker when scanned or empty pages are detected.
  * Image preprocessing (canvas grayscale + contrast enhancement) applied prior to OCR recognition.
* **Intelligent Question Segmentation:** Regular expressions parse numbered patterns (`1.`, `1)`, `Q1`), sub-questions (`(a)`, `(b)`), marks (`(10 marks)`), module tags (`Module I`), and exam years from filenames.
* **Two-Tier Clustering Architecture:**
  * **Tier 1 (Near-Exact Matches):** Normalized Levenshtein distance grouping via `fastest-levenshtein` (threshold: 0.85).
  * **Tier 2 (Semantic Clustering):** Off-thread vector embeddings generated via `@huggingface/transformers` (`Xenova/all-MiniLM-L6-v2`) with cosine similarity grouping (threshold: 0.75).
* **Ranked Results & Attribution:** Ranked frequency list displaying question recurrence across years, source papers, and similarity confidence.
* **Export & Bridge:** Export cluster reports as structured JSON or CSV, or send clusters directly into the Flashcards module.

### 3. Flashcards & Spaced Repetition (SM-2)
* **SuperMemo-2 (SM-2) Algorithm:** Complete client-side implementation of the SM-2 algorithm:
  * Dynamic ease factor adjustments floored at 1.3.
  * Adaptive review intervals (1 day $\rightarrow$ 6 days $\rightarrow$ interval $\times$ EF).
  * Repetition resets on failed recall.
* **Review Session UI:** Active recall flashcard flip interface with 4-point rating system (*Again*, *Hard*, *Good*, *Easy*) and keyboard shortcuts (Space to flip, 1-4 to rate).
* **Deck Management & Bulk Import:** Organize cards into decks by course, manually edit cards, or bulk import via CSV and PYQ analyzer output.
* **Retention Metrics:** Real-time tracking of due cards, cards reviewed today, average ease factor, and recall retention rates.

---

## Technical Architecture & Free-Stack Principles

* **Zero Paid Services:** No OpenAI, Claude, Azure, AWS, or credit-card-backed APIs anywhere in the codebase.
* **Pure Client-Side Database:** All persistent data (transcripts, papers, questions, clusters, decks, flashcards, review logs) is stored locally in the browser via `Dexie.js` (IndexedDB wrapper).
* **Non-Blocking Web Workers:** Heavy compute operations run in dedicated background threads:
  * `tesseract.worker.ts`: OCR processing for scanned PDFs and images.
  * `embeddings.worker.ts`: ONNX neural feature extraction using `@huggingface/transformers`.
* **Form & Data Validation:** Every upload, URL, flashcard, and CSV import is strictly validated using `Zod` schemas.

---

## Known Limitations

1. **YouTube Subtitle Availability & Rate Limiting:**
   * Extraction relies on creators having subtitles enabled or auto-generated captions provided by YouTube.
   * Excessive rapid queries from the same IP address may trigger temporary rate limiting (`429 Too Many Requests`) from YouTube.
2. **In-Browser OCR Accuracy:**
   * `Tesseract.js` executes inside the browser Web Worker. While contrast preprocessing improves readability, handwritten responses, heavily blurred scans, or multi-column newspaper layouts may yield degraded OCR quality compared to native OCR suites.
3. **First-Load Model Download for Embeddings:**
   * Tier 2 semantic clustering runs the `Xenova/all-MiniLM-L6-v2` model in WebAssembly/WebGPU. The ONNX model weights (~23MB) are downloaded on first usage and cached by the browser. Subsequent runs are fully offline and instant.
4. **Local Browser Storage Persistence:**
   * Data resides exclusively in the browser's IndexedDB. If you clear site data, private browser caches, or switch browsers, your decks and analyzed papers will be reset unless previously exported to JSON or CSV.

---

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run development server:**
   ```bash
   npm run dev
   ```

3. **Build production bundle:**
   ```bash
   npm run build
   ```
