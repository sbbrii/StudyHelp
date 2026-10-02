import { createWorker } from "tesseract.js";
import type { OcrWorkerMessage, OcrWorkerResponse } from "@/types";

let workerPromise: ReturnType<typeof createWorker> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          const res: OcrWorkerResponse = {
            type: "progress",
            progress: m.progress,
          };
          self.postMessage(res);
        }
      },
    });
  }
  return workerPromise;
}

self.onmessage = async (e: MessageEvent<OcrWorkerMessage>) => {
  const { type, imageData, pageIndex } = e.data;
  if (type === "process") {
    try {
      const worker = await getWorker();
      const blob = new Blob([imageData], { type: "image/png" });
      const result = await worker.recognize(blob);
      const res: OcrWorkerResponse = {
        type: "result",
        pageIndex,
        text: result.data.text,
      };
      self.postMessage(res);
    } catch (err: unknown) {
      const res: OcrWorkerResponse = {
        type: "error",
        pageIndex,
        error: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(res);
    }
  }
};
