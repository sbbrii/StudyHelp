import { db } from "./db";
import { extractVideoId, youtubeUrlSchema } from "./validators";
import type {
  CachedTranscript,
  TranscriptApiResponse,
  TranscriptError,
  TranscriptSegment,
} from "@/types";

export interface GetTranscriptResult {
  videoId: string;
  segments: TranscriptSegment[];
  fullText: string;
  fromCache: boolean;
  fetchedAt: number;
}

export class TranscriptServiceError extends Error {
  type: TranscriptError;
  constructor(type: TranscriptError, message: string) {
    super(message);
    this.name = "TranscriptServiceError";
    this.type = type;
  }
}

/**
 * Fetch a YouTube transcript with client-side IndexedDB caching.
 * Checks Dexie first; if found, returns immediately without API calls.
 */
export async function getYouTubeTranscript(
  urlInput: string
): Promise<GetTranscriptResult> {
  const trimmed = urlInput.trim();

  // Validate URL format
  const validationResult = youtubeUrlSchema.safeParse(trimmed);
  if (!validationResult.success) {
    throw new TranscriptServiceError(
      "invalid_url",
      validationResult.error.issues[0]?.message || "Invalid YouTube URL"
    );
  }

  const videoId = extractVideoId(trimmed);
  if (!videoId) {
    throw new TranscriptServiceError(
      "invalid_url",
      "Unable to extract a valid 11-character video ID from URL."
    );
  }

  // 1. Check Dexie Cache
  const cached = await db.transcripts.get(videoId);
  if (cached && cached.segments && cached.segments.length > 0) {
    return {
      videoId: cached.videoId,
      segments: cached.segments,
      fullText: cached.fullText,
      fromCache: true,
      fetchedAt: cached.fetchedAt,
    };
  }

  // 2. Fetch from Next.js API route
  let res: Response;
  try {
    res = await fetch("/api/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: trimmed }),
    });
  } catch {
    throw new TranscriptServiceError(
      "unknown",
      "Network connection failure while connecting to transcript service."
    );
  }

  const data = (await res.json()) as TranscriptApiResponse;

  if (!data.success || !data.data) {
    const errType = data.error?.type || "unknown";
    const errMsg = data.error?.message || "Failed to fetch transcript.";
    throw new TranscriptServiceError(errType, errMsg);
  }

  // 3. Cache into IndexedDB
  const record: CachedTranscript = {
    videoId,
    segments: data.data.segments,
    fullText: data.data.fullText,
    fetchedAt: Date.now(),
  };

  await db.transcripts.put(record);

  return {
    videoId,
    segments: data.data.segments,
    fullText: data.data.fullText,
    fromCache: false,
    fetchedAt: record.fetchedAt,
  };
}

/**
 * Format milliseconds into MM:SS or HH:MM:SS string.
 */
export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}
