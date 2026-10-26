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
