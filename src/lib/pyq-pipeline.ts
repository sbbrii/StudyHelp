import { db } from "./db";
import {
  extractTextFromPdf,
  renderPdfPageToImage,
  preprocessImage,
} from "./pdf-extract";
import { segmentQuestions, inferYear } from "./question-segmenter";
import { clusterQuestions } from "./clustering";
import { runOcrInWorker, generateEmbeddingsInWorker } from "./worker-client";
import { fileUploadSchema } from "./validators";
import type {
  ProcessingProgress,
  PyqDocument,
  PyqQuestion,
  QuestionCluster,
} from "@/types";

export interface ProcessFilesOptions {
  onProgress?: (progress: ProcessingProgress) => void;
}

/**
 * Process uploaded question papers (PDF or images):
 * 1. Validate files
 * 2. Extract text (pdfjs -> Tesseract OCR fallback for empty/scanned PDFs or images)
 * 3. Save document record in Dexie
 * 4. Segment questions and persist to Dexie (giving each an auto-increment ID)
 * 5. Generate embeddings off-thread via Web Worker and update questions
 * 6. Run Tier 1 + Tier 2 clustering on persisted questions with IDs
 * 7. Store clusters in Dexie and return results
 */
export async function processPyqFiles(
  files: File[],
  options: ProcessFilesOptions = {}
): Promise<{
  documents: PyqDocument[];
  questions: PyqQuestion[];
  clusters: QuestionCluster[];
}> {
  const { onProgress } = options;
  const processedDocs: PyqDocument[] = [];
  const allCreatedQuestionIds: number[] = [];

  const totalFiles = files.length;

  for (let fileIdx = 0; fileIdx < totalFiles; fileIdx++) {
    const file = files[fileIdx];

    // Validate
    fileUploadSchema.parse({ file });

    const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
    const inferredYear = inferYear(file.name);

    let rawText = "";
    let extractionMethod: "pdfjs" | "ocr" = "pdfjs";
    let pageCount = 1;

    onProgress?.({
      stage: "extracting",
      current: fileIdx + 1,
      total: totalFiles,
      message: `Extracting text from ${file.name}...`,
    });

    if (isPdf) {
      const buffer = await file.arrayBuffer();
      const pdfResult = await extractTextFromPdf(buffer);
      pageCount = pdfResult.pageCount;

      if (!pdfResult.isEmpty && pdfResult.text.length > 50) {
        rawText = pdfResult.text;
        extractionMethod = "pdfjs";
      } else {
        // Fallback to Tesseract OCR for scanned PDF
        extractionMethod = "ocr";
        onProgress?.({
          stage: "ocr",
          current: fileIdx + 1,
          total: totalFiles,
          message: `${file.name} appears scanned. Running OCR fallback across ${pageCount} page(s)...`,
        });

        const ocrPages: string[] = [];
        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
          onProgress?.({
            stage: "ocr",
            current: pageNum,
            total: pageCount,
            message: `OCR processing page ${pageNum}/${pageCount} of ${file.name}...`,
          });

          const pageImage = await renderPdfPageToImage(buffer, pageNum);
          const pageText = await runOcrInWorker(pageImage, pageNum);
          ocrPages.push(pageText);
        }
        rawText = ocrPages.join("\n\n");
      }
    } else {
      // Image file
      extractionMethod = "ocr";
      onProgress?.({
        stage: "ocr",
        current: fileIdx + 1,
        total: totalFiles,
        message: `Preprocessing and running OCR on ${file.name}...`,
      });

      const preprocessed = await preprocessImage(file);
      rawText = await runOcrInWorker(preprocessed, 1);
    }

    // Persist Document record
    const docId = await db.pyqDocuments.add({
      filename: file.name,
      fileType: isPdf ? "pdf" : "image",
      year: inferredYear,
      extractionMethod,
      rawText,
      pageCount,
      uploadedAt: Date.now(),
    });

    const docRecord = await db.pyqDocuments.get(docId);
    if (docRecord) processedDocs.push(docRecord);

    // Segment questions
    onProgress?.({
      stage: "segmenting",
      current: fileIdx + 1,
      total: totalFiles,
      message: `Segmenting exam questions for ${file.name}...`,
    });

    const segmented = segmentQuestions(rawText, file.name, inferredYear);

    // Persist questions to Dexie FIRST (so each gets a valid auto-increment ID)
    const questionsToInsert = segmented.map((q) => ({
      ...q,
      documentId: docId as number,
    }));

    for (const q of questionsToInsert) {
      const qId = await db.pyqQuestions.add(q);
      allCreatedQuestionIds.push(qId as number);
    }
  }

  // Load all persisted questions that need embedding and clustering
  const questionsToEmbed = await db.pyqQuestions
    .where("id")
    .anyOf(allCreatedQuestionIds)
    .toArray();

  if (questionsToEmbed.length > 0) {
    onProgress?.({
      stage: "embedding",
      current: 0,
      total: questionsToEmbed.length,
      message: `Computing semantic embeddings for ${questionsToEmbed.length} questions in worker...`,
    });

    const texts = questionsToEmbed.map((q) => q.text);
    const embeddings = await generateEmbeddingsInWorker(
      texts,
      (msg, pct) => {
        onProgress?.({
          stage: "embedding",
          current: Math.round((pct / 100) * questionsToEmbed.length),
          total: questionsToEmbed.length,
          message: msg,
        });
      }
    );

    // Update questions in Dexie with embeddings
    for (let i = 0; i < questionsToEmbed.length; i++) {
      if (embeddings[i] && questionsToEmbed[i].id) {
        questionsToEmbed[i].embedding = embeddings[i];
        await db.pyqQuestions.update(questionsToEmbed[i].id!, {
          embedding: embeddings[i],
        });
      }
    }
  }

  // Fetch all questions from Dexie to cluster across the corpus
  const allCorpusQuestions = await db.pyqQuestions.toArray();

  onProgress?.({
    stage: "clustering",
    current: 1,
    total: 1,
    message: `Running Tier 1 (Levenshtein) + Tier 2 (Semantic) clustering...`,
  });

  // Run clustering on persisted questions with IDs
  const rawClusters = clusterQuestions(allCorpusQuestions);

  // Clear existing clusters and insert fresh ones
  await db.questionClusters.clear();
  for (const c of rawClusters) {
    await db.questionClusters.add(c);
  }

  const finalClusters = await db.questionClusters
    .orderBy("frequency")
    .reverse()
    .toArray();

  onProgress?.({
    stage: "done",
    current: totalFiles,
    total: totalFiles,
    message: `Successfully processed ${totalFiles} file(s) and formed ${finalClusters.length} clusters!`,
  });

  return {
    documents: processedDocs,
    questions: allCorpusQuestions,
    clusters: finalClusters,
  };
}
