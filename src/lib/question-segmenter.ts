import type { PyqQuestion } from "@/types";

/**
 * Regex patterns for segmenting exam questions from extracted text.
 */
const QUESTION_PATTERNS = [
  // "1." or "1)" or "1 ." with leading whitespace/newline
  /(?:^|\n)\s*(\d{1,3})\s*[.)]\s*/g,
  // "Q1" or "Q.1" or "Q 1)" variations
  /(?:^|\n)\s*Q\.?\s*(\d{1,3})\s*[.):]?\s*/gi,
  // "(a)" "(b)" sub-questions
  /(?:^|\n)\s*\(([a-z])\)\s*/g,
];

const MARKS_PATTERN = /\((\d{1,2})\s*marks?\)/gi;
const MODULE_PATTERN =
  /(?:Module|Unit|Part|Section)\s*[-–:.]?\s*([IVXLC\d]+|\w+)/gi;
const YEAR_PATTERN = /(?:20|19)\d{2}/g;

/**
 * Try to infer year from filename.
 * Handles: "QP_2019.pdf", "Jan2020_CS301.pdf", "2021-May-paper.pdf"
 */
export function inferYear(filename: string): string | undefined {
  const matches = filename.match(YEAR_PATTERN);
  if (matches && matches.length > 0) {
    // Return the last year found (often the most relevant)
    return matches[matches.length - 1];
  }
  return undefined;
}

/**
 * Detect module/unit tags from text block.
 */
export function detectModule(text: string): string | undefined {
  const match = MODULE_PATTERN.exec(text);
  MODULE_PATTERN.lastIndex = 0; // Reset regex state
  return match ? `Module ${match[1]}` : undefined;
}

/**
 * Detect marks from question text.
 */
export function detectMarks(text: string): number | undefined {
  const match = MARKS_PATTERN.exec(text);
  MARKS_PATTERN.lastIndex = 0;
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Primary question segmenter.
 *
 * Strategy:
 * 1. Split on numbered question patterns (1., Q1, etc.)
 * 2. For each segment, extract marks and module tags
 * 3. Filter out segments that are too short (likely headers/noise)
 */
export function segmentQuestions(
  rawText: string,
  sourceFile: string,
  year?: string
): Omit<PyqQuestion, "id" | "embedding">[] {
  const questions: Omit<PyqQuestion, "id" | "embedding">[] = [];

  // Normalize line endings
  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Track current module context
  let currentModule: string | undefined;

  // Try primary split: numbered questions
  const segments = splitByNumbers(text);

  if (segments.length === 0) {
    // Fallback: split by double newlines if no numbered pattern found
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      const moduleCheck = detectModule(para);
      if (moduleCheck) {
        currentModule = moduleCheck;
        // If the paragraph is ONLY a module header, skip it as a question
        if (para.length < 40) continue;
      }

      questions.push({
        documentId: 0, // Will be set when saving
        text: para,
        normalizedText: para
          .toLowerCase()
          .replace(/[^\w\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
        sourceFile,
        year,
        moduleTag: currentModule,
        marks: detectMarks(para),
        questionNumber: String(i + 1),
      });
    }
  } else {
    for (const segment of segments) {
      // Check for module headers
      const moduleCheck = detectModule(segment.text);
      if (moduleCheck) {
        currentModule = moduleCheck;
      }

      // Skip very short segments (likely noise)
      if (segment.text.trim().length < 15) continue;

      questions.push({
        documentId: 0,
        text: segment.text.trim(),
        normalizedText: segment.text
          .trim()
          .toLowerCase()
          .replace(/[^\w\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
        sourceFile,
        year,
        moduleTag: currentModule,
        marks: detectMarks(segment.text),
        questionNumber: segment.number,
      });
    }
  }

  return questions;
}

interface TextSegment {
  text: string;
  number: string;
}

/**
 * Split text into segments using numbered patterns.
 */
function splitByNumbers(text: string): TextSegment[] {
  // Find all positions where a question number starts
  const positions: { index: number; number: string; matchLength: number }[] =
    [];

  // Pattern: "1." or "1)" at start of line
  const pattern = /(?:^|\n)\s*(\d{1,3})\s*[.)]\s*/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    positions.push({
      index: match.index,
      number: match[1],
      matchLength: match[0].length,
    });
  }

  // Also check "Q1" pattern
  const qPattern = /(?:^|\n)\s*Q\.?\s*(\d{1,3})\s*[.):]?\s*/gi;
  while ((match = qPattern.exec(text)) !== null) {
    // Don't add if we already have this position
    if (!positions.some((p) => Math.abs(p.index - match!.index) < 5)) {
      positions.push({
        index: match.index,
        number: match[1],
        matchLength: match[0].length,
      });
    }
  }

  // Sort by position
  positions.sort((a, b) => a.index - b.index);

  if (positions.length === 0) return [];

  const segments: TextSegment[] = [];

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index + positions[i].matchLength;
    const end =
      i + 1 < positions.length ? positions[i + 1].index : text.length;
    const segmentText = text.slice(start, end).trim();

    if (segmentText.length > 0) {
      segments.push({
        text: segmentText,
        number: positions[i].number,
      });
    }
  }

  return segments;
}
