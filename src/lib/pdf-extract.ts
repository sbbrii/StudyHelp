/**
 * PDF text extraction using pdfjs-dist.
 * Runs client-side only — must be in a 'use client' component context.
 */
import type { ExtractionResult } from "@/types";

let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  return pdfjsLib;
}

/**
 * Extract text from a PDF file buffer.
 * Returns the extracted text, page count, and whether the text is empty
 * (which triggers OCR fallback).
 */
export async function extractTextFromPdf(
  arrayBuffer: ArrayBuffer
): Promise<ExtractionResult> {
  const pdfjs = await getPdfjs();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";
  const pageCount = pdf.numPages;

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => {
        if ("str" in item) return item.str;
        return "";
      })
      .join(" ");
    fullText += pageText + "\n\n";
  }

  const trimmed = fullText.trim();
  // Consider text "empty" if less than 50 chars per page on average
  const isEmpty = trimmed.length < pageCount * 50;

  return {
    text: trimmed,
    pageCount,
    isEmpty,
    method: "pdfjs",
  };
}

/**
 * Render a PDF page to an image (for OCR fallback).
 * Returns a Blob of the rendered page.
 */
export async function renderPdfPageToImage(
  arrayBuffer: ArrayBuffer,
  pageNumber: number,
  scale: number = 2.0
): Promise<Blob> {
  const pdfjs = await getPdfjs();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNumber);

  const viewport = page.getViewport({ scale });
  const sourceCanvas = document.createElement("canvas");
  const sourceCtx = sourceCanvas.getContext("2d")!;
  sourceCanvas.width = viewport.width;
  sourceCanvas.height = viewport.height;

  await page.render({
    canvas: sourceCanvas,
    canvasContext: sourceCtx,
    viewport,
  }).promise;

  // Use a second offscreen canvas to apply grayscale + contrast for OCR
  const filteredCanvas = document.createElement("canvas");
  const filteredCtx = filteredCanvas.getContext("2d")!;
  filteredCanvas.width = viewport.width;
  filteredCanvas.height = viewport.height;

  filteredCtx.filter = "grayscale(100%) contrast(150%)";
  filteredCtx.drawImage(sourceCanvas, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    filteredCanvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to render PDF page to image"));
      },
      "image/png"
    );
  });
}

/**
 * Preprocess an uploaded image (PNG/JPEG/WebP) with grayscale + contrast for OCR.
 */
export async function preprocessImage(imageFile: Blob | File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageFile);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(imageFile);
        return;
      }
      ctx.filter = "grayscale(100%) contrast(150%)";
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else resolve(imageFile);
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for preprocessing"));
    };
    img.src = url;
  });
}
