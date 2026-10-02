import { pipeline, env } from "@huggingface/transformers";
import type { EmbeddingWorkerMessage, EmbeddingWorkerResponse } from "@/types";

// Ensure models load from remote CDN in browser Web Worker
env.allowLocalModels = false;

let extractorPromise: ReturnType<typeof pipeline> | null = null;

async function getExtractor() {
  if (!extractorPromise) {
    self.postMessage({
      type: "progress",
      message: "Initializing embedding pipeline (Xenova/all-MiniLM-L6-v2)...",
      progress: 0,
    } as EmbeddingWorkerResponse);

    extractorPromise = pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      {
        progress_callback: (info: {
          status?: string;
          total?: number;
          loaded?: number;
          file?: string;
        }) => {
          if (info.status === "progress" && info.total && info.loaded) {
            const pct = Math.round((info.loaded / info.total) * 100);
            self.postMessage({
              type: "progress",
              progress: pct,
              message: `Loading model file ${info.file || ""}: ${pct}%`,
            } as EmbeddingWorkerResponse);
          }
        },
      }
    );
  }
  return extractorPromise;
}

self.onmessage = async (e: MessageEvent<EmbeddingWorkerMessage>) => {
  const { type, texts, batchId } = e.data;
  if (type === "embed") {
    try {
      const extractor = (await getExtractor()) as unknown as (
        text: string,
        opts?: Record<string, unknown>
      ) => Promise<{ tolist: () => number[][]; data: ArrayLike<number> }>;

      const embeddings: number[][] = [];
      const total = texts.length;

      for (let i = 0; i < total; i++) {
        const text = texts[i];
        const output = await extractor(text, {
          pooling: "mean",
          normalize: true,
        });

        // output.tolist() returns [[...384 numbers...]]
        const list = output.tolist();
        const vector: number[] = Array.isArray(list[0])
          ? list[0]
          : Array.from(output.data);
        embeddings.push(vector);

        if ((i + 1) % 5 === 0 || i === total - 1) {
          self.postMessage({
            type: "progress",
            batchId,
            progress: Math.round(((i + 1) / total) * 100),
            message: `Computed embeddings for ${i + 1} / ${total} questions...`,
          } as EmbeddingWorkerResponse);
        }
      }

      self.postMessage({
        type: "result",
        batchId,
        embeddings,
      } as EmbeddingWorkerResponse);
    } catch (err: unknown) {
      console.error("Embedding worker error:", err);
      self.postMessage({
        type: "error",
        batchId,
        error: err instanceof Error ? err.message : String(err),
      } as EmbeddingWorkerResponse);
    }
  }
};
