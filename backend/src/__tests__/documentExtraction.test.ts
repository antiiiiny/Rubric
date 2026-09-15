import { describe, expect, it } from "vitest";
import { detectSections, extractText } from "../services/documentExtraction.service";
import { AppError } from "../errors/AppError";

describe("detectSections", () => {
  it("finds a section whose name appears as a heading line", () => {
    const text = "Introduction\nThis paper discusses normalization.\n\nConclusion\nIn summary...";
    const result = detectSections(text, [
      { name: "Introduction", required: true },
      { name: "Conclusion", required: true },
      { name: "Methodology", required: true },
    ]);

    expect(result.find((r) => r.name === "Introduction")?.found).toBe(true);
    expect(result.find((r) => r.name === "Conclusion")?.found).toBe(true);
    expect(result.find((r) => r.name === "Methodology")?.found).toBe(false);
  });

  it("is case-insensitive and tolerates trailing punctuation on the heading", () => {
    const text = "INTRODUCTION:\nSome text here.";
    const result = detectSections(text, [{ name: "Introduction", required: true }]);
    expect(result[0].found).toBe(true);
  });

  it("marks non-required sections as not-found without treating that as an error", () => {
    const text = "Body text only, no headings.";
    const result = detectSections(text, [{ name: "Appendix", required: false }]);
    expect(result[0]).toEqual({ name: "Appendix", required: false, found: false });
  });
});

describe("extractText", () => {
  it("rejects an unsupported mime type", async () => {
    await expect(extractText(Buffer.from("hello"), "text/plain")).rejects.toThrow(AppError);
  });

  it("rejects a corrupted/invalid PDF buffer rather than returning garbage", async () => {
    await expect(extractText(Buffer.from("not a real pdf"), "application/pdf")).rejects.toThrow(AppError);
  });
});
