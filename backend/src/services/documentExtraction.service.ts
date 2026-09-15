import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { AppError } from "../errors/AppError";
import type { SectionCheckEntry } from "../db/assessments.repo";

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export async function extractText(buffer: Buffer, mimetype: string): Promise<string> {
  try {
    if (mimetype === "application/pdf") {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      return result.text;
    }
    if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
  } catch {
    throw AppError.badRequest("Could not parse the uploaded document. Is the file corrupted?");
  }
  throw AppError.badRequest("Unsupported file type. Upload a PDF or DOCX file.");
}

// Deterministic (not AI) required-section detection: a section counts as
// present if any line of the extracted text is a heading-like match for its
// name — a cheap, faculty-explainable check per CLAUDE.md's deterministic/AI
// split (required sections belong in the deterministic bucket).
export function detectSections(
  text: string,
  sections: { name: string; required: boolean }[],
): SectionCheckEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase().replace(/[:.\-–]+$/, "").trim());

  return sections.map((section) => {
    const needle = section.name.trim().toLowerCase();
    const found = lines.some((line) => line === needle || line.startsWith(needle));
    return { name: section.name, required: section.required, found };
  });
}
