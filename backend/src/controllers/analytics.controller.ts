import type { Request, Response } from "express";
import { conceptMasteryForCourse } from "../db/analytics.repo";

// A concept is flagged as a common misconception once at least this share of
// responses were "missing" or "partial" — a simple, faculty-explainable
// threshold rather than a statistical model (fast/minimum-scope per CLAUDE.md).
const MISCONCEPTION_THRESHOLD = 0.4;

export async function getConceptMastery(req: Request, res: Response) {
  const rows = await conceptMasteryForCourse(req.course!.id);

  const concepts = rows.map((r) => {
    const total = Number(r.total_responses);
    const covered = Number(r.covered_count);
    const partial = Number(r.partial_count);
    const missing = Number(r.missing_count);
    // Deterministic weighted mastery, same status->points mapping used for
    // scoring (covered=100, partial=50, missing=0) — never LLM-asserted.
    const masteryPercent = total === 0 ? 0 : Math.round(((covered * 100 + partial * 50) / total) * 100) / 100;
    const strugglingShare = total === 0 ? 0 : (partial + missing) / total;

    return {
      concept: r.concept,
      totalResponses: total,
      coveredCount: covered,
      partialCount: partial,
      missingCount: missing,
      masteryPercent,
      commonMisconception: strugglingShare >= MISCONCEPTION_THRESHOLD,
    };
  });

  res.status(200).json({ concepts });
}
