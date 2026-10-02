import type { PyqQuestion, QuestionCluster } from "@/types";
import {
  levenshteinSimilarity,
  cosineSimilarity,
  SIMILARITY_THRESHOLDS,
} from "./similarity";

/**
 * Two-pass question clustering.
 *
 * Pass 1 (near-exact): Groups by Levenshtein similarity on normalized text.
 * Pass 2 (semantic): Groups remaining questions by cosine similarity of embeddings.
 *
 * Uses a greedy approach: for each unclustered question, find all similar
 * questions above the threshold and form a cluster.
 */
export function clusterQuestions(
  questions: PyqQuestion[],
  nearExactThreshold: number = SIMILARITY_THRESHOLDS.nearExact,
  semanticThreshold: number = SIMILARITY_THRESHOLDS.semantic
): Omit<QuestionCluster, "id">[] {
  const clusters: Omit<QuestionCluster, "id">[] = [];
  const clustered = new Set<number>(); // Track clustered question indices

  // --- Pass 1: Near-exact matches (Levenshtein) ---
  for (let i = 0; i < questions.length; i++) {
    if (clustered.has(i)) continue;

    const matches: number[] = [i];

    for (let j = i + 1; j < questions.length; j++) {
      if (clustered.has(j)) continue;

      const sim = levenshteinSimilarity(
        questions[i].normalizedText,
        questions[j].normalizedText
      );

      if (sim >= nearExactThreshold) {
        matches.push(j);
      }
    }

    if (matches.length > 1) {
      // Found duplicates
      const questionIds = matches
        .map((idx) => questions[idx].id!)
        .filter(Boolean);
      const years = [
        ...new Set(
          matches
            .map((idx) => questions[idx].year)
            .filter((y): y is string => !!y)
        ),
      ];
      const sourceFiles = [
        ...new Set(matches.map((idx) => questions[idx].sourceFile)),
      ];

      // Pick shortest text as representative (usually the cleanest)
      const representative = matches
        .map((idx) => questions[idx].text)
        .sort((a, b) => a.length - b.length)[0];

      // Compute average similarity within cluster
      let totalSim = 0;
      let simCount = 0;
      for (let m = 0; m < matches.length; m++) {
        for (let n = m + 1; n < matches.length; n++) {
          totalSim += levenshteinSimilarity(
            questions[matches[m]].normalizedText,
            questions[matches[n]].normalizedText
          );
          simCount++;
        }
      }

      clusters.push({
        representative,
        questionIds,
        frequency: matches.length,
        years,
        sourceFiles,
        matchType: "exact",
        avgSimilarity: simCount > 0 ? Math.round((totalSim / simCount) * 100) / 100 : 1,
      });

      matches.forEach((idx) => clustered.add(idx));
    }
  }

  // --- Pass 2: Semantic matches (cosine similarity of embeddings) ---
  const unclustered = questions
    .map((q, i) => ({ question: q, index: i }))
    .filter(({ index }) => !clustered.has(index))
    .filter(({ question }) => question.embedding && question.embedding.length > 0);

  for (let i = 0; i < unclustered.length; i++) {
    if (clustered.has(unclustered[i].index)) continue;

    const matches: number[] = [unclustered[i].index];

    for (let j = i + 1; j < unclustered.length; j++) {
      if (clustered.has(unclustered[j].index)) continue;

      const embA = unclustered[i].question.embedding!;
      const embB = unclustered[j].question.embedding!;
      const sim = cosineSimilarity(embA, embB);

      if (sim >= semanticThreshold) {
        matches.push(unclustered[j].index);
      }
    }

    if (matches.length > 1) {
      const questionIds = matches
        .map((idx) => questions[idx].id!)
        .filter(Boolean);
      const years = [
        ...new Set(
          matches
            .map((idx) => questions[idx].year)
            .filter((y): y is string => !!y)
        ),
      ];
      const sourceFiles = [
        ...new Set(matches.map((idx) => questions[idx].sourceFile)),
      ];

      const representative = matches
        .map((idx) => questions[idx].text)
        .sort((a, b) => a.length - b.length)[0];

      let totalSim = 0;
      let simCount = 0;
      for (let m = 0; m < matches.length; m++) {
        for (let n = m + 1; n < matches.length; n++) {
          const embA = questions[matches[m]].embedding!;
          const embB = questions[matches[n]].embedding!;
          totalSim += cosineSimilarity(embA, embB);
          simCount++;
        }
      }

      clusters.push({
        representative,
        questionIds,
        frequency: matches.length,
        years,
        sourceFiles,
        matchType: "semantic",
        avgSimilarity: simCount > 0 ? Math.round((totalSim / simCount) * 100) / 100 : 1,
      });

      matches.forEach((idx) => clustered.add(idx));
    }
  }

  // Sort clusters by frequency (most repeated first)
  clusters.sort((a, b) => b.frequency - a.frequency);

  return clusters;
}
