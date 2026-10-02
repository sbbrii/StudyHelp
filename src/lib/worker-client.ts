import type {
  OcrWorkerMessage,
  OcrWorkerResponse,
  EmbeddingWorkerMessage,
  EmbeddingWorkerResponse,
} from "@/types";

/**
 * Run Tesseract OCR in a dedicated Web Worker.
 */
export async function runOcrInWorker(
  imageBlob: Blob,
  pageIndex: number = 0,
  onProgress?: (progress: number) => void
): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Worker can only be instantiated in browser environment");
  }

  const worker = new Worker(
    new URL("../workers/tesseract.worker.ts", import.meta.url)
  );

  const arrayBuffer = await imageBlob.arrayBuffer();

  return new Promise<string>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<OcrWorkerResponse>) => {
      const data = e.data;
      if (data.type === "progress" && data.progress !== undefined) {
        onProgress?.(data.progress);
      } else if (data.type === "result") {
        worker.terminate();
        resolve(data.text || "");
      } else if (data.type === "error") {
        worker.terminate();
        reject(new Error(data.error || "OCR Worker error"));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    const msg: OcrWorkerMessage = {
      type: "process",
      imageData: arrayBuffer,
      pageIndex,
    };

    worker.postMessage(msg, [arrayBuffer]);
  });
}

/**
 * Generate semantic embeddings in a dedicated Web Worker using Xenova/all-MiniLM-L6-v2.
 */
export async function generateEmbeddingsInWorker(
  texts: string[],
  onProgress?: (message: string, progress: number) => void
): Promise<number[][]> {
  if (typeof window === "undefined") {
    throw new Error("Worker can only be instantiated in browser environment");
  }

  if (texts.length === 0) return [];

  const worker = new Worker(
    new URL("../workers/embeddings.worker.ts", import.meta.url)
  );

  return new Promise<number[][]>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<EmbeddingWorkerResponse>) => {
      const data = e.data;
      if (data.type === "progress") {
        onProgress?.(data.message || "", data.progress || 0);
      } else if (data.type === "result") {
        worker.terminate();
        resolve(data.embeddings || []);
      } else if (data.type === "error") {
        worker.terminate();
        reject(new Error(data.error || "Embedding Worker error"));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    const msg: EmbeddingWorkerMessage = {
      type: "embed",
      texts,
      batchId: Date.now(),
    };

    worker.postMessage(msg);
  });
}
