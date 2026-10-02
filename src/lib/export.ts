import type { PyqQuestion, QuestionCluster } from "@/types";

/**
 * Export question clusters as CSV.
 */
export function exportClustersAsCSV(
  clusters: QuestionCluster[],
  allQuestions: PyqQuestion[]
): string {
  const headers = [
    "Cluster #",
    "Frequency",
    "Match Type",
    "Avg Similarity",
    "Representative Question",
    "Years",
    "Source Files",
  ];

  const rows = clusters.map((cluster, i) => [
    String(i + 1),
    String(cluster.frequency),
    cluster.matchType,
    String(cluster.avgSimilarity),
    `"${cluster.representative.replace(/"/g, '""')}"`,
    `"${cluster.years.join(", ")}"`,
    `"${cluster.sourceFiles.join(", ")}"`,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

/**
 * Export question clusters as JSON.
 */
export function exportClustersAsJSON(
  clusters: QuestionCluster[],
  allQuestions: PyqQuestion[]
): string {
  const data = clusters.map((cluster, i) => ({
    rank: i + 1,
    frequency: cluster.frequency,
    matchType: cluster.matchType,
    avgSimilarity: cluster.avgSimilarity,
    representative: cluster.representative,
    years: cluster.years,
    sourceFiles: cluster.sourceFiles,
    questions: cluster.questionIds
      .map((qid) => allQuestions.find((q) => q.id === qid))
      .filter(Boolean)
      .map((q) => ({
        text: q!.text,
        sourceFile: q!.sourceFile,
        year: q!.year,
        module: q!.moduleTag,
      })),
  }));

  return JSON.stringify(data, null, 2);
}

/**
 * Convert clusters to flashcard import format.
 */
export function clustersToFlashcards(
  clusters: QuestionCluster[]
): { front: string; back: string }[] {
  return clusters.map((cluster) => ({
    front: cluster.representative,
    back: `Appeared ${cluster.frequency} time(s) in: ${cluster.years.join(", ")}.\nSource: ${cluster.sourceFiles.join(", ")}.\nMatch type: ${cluster.matchType} (${Math.round(cluster.avgSimilarity * 100)}% similarity)`,
  }));
}

/**
 * Parse CSV text into flashcard rows.
 * Expects header row with "front" and "back" columns.
 */
export function parseFlashcardCSV(
  csvText: string
): { front: string; back: string }[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase();
  const frontIdx = header.split(",").findIndex((h) => h.trim().includes("front"));
  const backIdx = header.split(",").findIndex((h) => h.trim().includes("back"));

  if (frontIdx === -1 || backIdx === -1) {
    // Try positional: first column = front, second = back
    return lines.slice(1).map((line) => {
      const parts = parseCSVLine(line);
      return {
        front: parts[0]?.trim() || "",
        back: parts[1]?.trim() || "",
      };
    }).filter((r) => r.front && r.back);
  }

  return lines
    .slice(1)
    .map((line) => {
      const parts = parseCSVLine(line);
      return {
        front: parts[frontIdx]?.trim() || "",
        back: parts[backIdx]?.trim() || "",
      };
    })
    .filter((r) => r.front && r.back);
}

/**
 * Simple CSV line parser that handles quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

/**
 * Download a string as a file.
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = "text/plain"
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
