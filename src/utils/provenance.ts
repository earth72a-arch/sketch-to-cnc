import type { ProvenanceSource, ReviewStatus } from "../types/project";

/**
 * Maps a review status to the provenance source that should accompany it
 * when a dimension's status is set directly by the user in the editor.
 * Kept as a pure function so the mapping is independently testable.
 */
export function provenanceSourceForStatus(status: ReviewStatus): ProvenanceSource {
  switch (status) {
    case "confirmed":
      return "user_confirmed";
    case "derived":
      return "derived";
    case "rule":
      return "rule";
    default:
      return "user_read";
  }
}

/** Session 3A — same confirmed/unconfirmed mapping as
 * `provenanceSourceForStatus`, but tags the unconfirmed case as
 * `"tap_to_dimension"` instead of the generic `"user_read"`, so a
 * dimension entered via Tap-to-Dimension stays distinguishable from one
 * typed directly into the Dimension Editor form or transferred from an
 * OCR candidate (CLAUDE.md: provenance must always be traceable). */
export function provenanceSourceForTapInput(status: ReviewStatus): ProvenanceSource {
  return status === "confirmed" ? "user_confirmed" : "tap_to_dimension";
}
