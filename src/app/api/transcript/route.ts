import { NextRequest, NextResponse } from "next/server";
import {
  YoutubeTranscript,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript";
import { extractVideoId } from "@/lib/validators";
import type { TranscriptApiResponse, TranscriptSegment } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json<TranscriptApiResponse>(
        {
          success: false,
          error: {
            type: "invalid_url",
            message: "A valid YouTube URL is required.",
          },
        },
        { status: 400 }
      );
    }

    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      return NextResponse.json<TranscriptApiResponse>(
        {
          success: false,
          error: {
            type: "invalid_url",
            message: "Could not extract a valid YouTube video ID from the provided URL.",
          },
        },
        { status: 400 }
      );
    }

    const rawSegments = await YoutubeTranscript.fetchTranscript(videoId);
    if (!rawSegments || rawSegments.length === 0) {
      return NextResponse.json<TranscriptApiResponse>(
        {
          success: false,
          error: {
            type: "no_captions",
            message: "No captions or transcripts were found for this video.",
          },
        },
        { status: 404 }
      );
    }

    // Determine if timings are in seconds or ms
    const isSeconds =
      rawSegments.length > 0 &&
      (rawSegments.some(
        (s) => s.duration > 0 && s.duration < 60 && !Number.isInteger(s.duration)
      ) ||
        (rawSegments.length > 10 &&
          rawSegments[rawSegments.length - 1].offset < 1000));

    const segments: TranscriptSegment[] = rawSegments.map((s) => ({
      text: s.text,
      offset: Math.round(isSeconds ? s.offset * 1000 : s.offset),
      duration: Math.round(isSeconds ? s.duration * 1000 : s.duration),
    }));

    const fullText = segments.map((s) => s.text).join(" ");

    return NextResponse.json<TranscriptApiResponse>({
      success: true,
      data: {
        segments,
        fullText,
      },
    });
  } catch (error: unknown) {
    console.error("Transcript fetch error:", error);

    let type: "no_captions" | "rate_limited" | "invalid_url" | "unknown" =
      "unknown";
    let message =
      "An unexpected error occurred while fetching the transcript.";

    const errMsg = (
      error instanceof Error ? error.message : String(error)
    ).toLowerCase();

    if (
      error instanceof YoutubeTranscriptTooManyRequestError ||
      errMsg.includes("too many requests") ||
      errMsg.includes("rate limit") ||
      errMsg.includes("429") ||
      errMsg.includes("ip") ||
      errMsg.includes("blocked")
    ) {
      type = "rate_limited";
      message =
        "YouTube rate limited or blocked the transcript request. Please try again later.";
    } else if (
      error instanceof YoutubeTranscriptDisabledError ||
      error instanceof YoutubeTranscriptNotAvailableError ||
      error instanceof YoutubeTranscriptNotAvailableLanguageError ||
      errMsg.includes("disabled") ||
      errMsg.includes("not available") ||
      errMsg.includes("captions are disabled") ||
      errMsg.includes("no transcript")
    ) {
      type = "no_captions";
      message =
        "No captions or subtitles are available for this video (disabled by creator or none generated).";
    } else if (
      error instanceof YoutubeTranscriptVideoUnavailableError ||
      errMsg.includes("unavailable") ||
      errMsg.includes("invalid") ||
      errMsg.includes("video not found")
    ) {
      type = "invalid_url";
      message = "This video is unavailable, private, or does not exist.";
    }

    const statusCode =
      type === "rate_limited"
        ? 429
        : type === "no_captions"
        ? 404
        : type === "invalid_url"
        ? 400
        : 500;

    return NextResponse.json<TranscriptApiResponse>(
      {
        success: false,
        error: {
          type,
          message,
        },
      },
      { status: statusCode }
    );
  }
}
