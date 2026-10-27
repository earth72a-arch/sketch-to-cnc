import { describe, expect, it } from "vitest";
import { applyAutoRunGuard } from "./textRegionGuard";
import type { TextRegionCandidate } from "./types";

function region(id: string, width: number, height: number): TextRegionCandidate {
  return { id, region: { x: 0, y: 0, width, height }, method: "auto-region", sourceComponentCount: 1 };
}

describe("applyAutoRunGuard", () => {
  it("passes everything through unchanged when under both limits", () => {
    const regions = [region("a", 10, 10), region("b", 20, 10)];
    const result = applyAutoRunGuard(regions, { maxRegions: 10, maxRegionAreaPx: 1000 });
    expect(result.accepted).toHaveLength(2);
    expect(result.rejectedOversized).toHaveLength(0);
    expect(result.rejectedOverCap).toHaveLength(0);
    expect(result.message).toBeNull();
  });

  it("excludes a region larger than maxRegionAreaPx and explains why", () => {
    const regions = [region("small", 10, 10), region("huge", 2000, 2000)];
    const result = applyAutoRunGuard(regions, { maxRegions: 10, maxRegionAreaPx: 1000 });
    expect(result.accepted.map((r) => r.id)).toEqual(["small"]);
    expect(result.rejectedOversized.map((r) => r.id)).toEqual(["huge"]);
    expect(result.message).toContain("ใหญ่เกินเกณฑ์");
  });

  it("caps to maxRegions, keeping the largest and explaining the truncation", () => {
    const regions = [region("a", 5, 5), region("b", 20, 20), region("c", 10, 10)];
    const result = applyAutoRunGuard(regions, { maxRegions: 2, maxRegionAreaPx: 10000 });
    expect(result.accepted.map((r) => r.id)).toEqual(["b", "c"]);
    expect(result.rejectedOverCap.map((r) => r.id)).toEqual(["a"]);
    expect(result.message).toContain("เกินเกณฑ์สูงสุด");
  });

  it("never silently drops data — a cap violation always produces a message", () => {
    const regions = Array.from({ length: 5 }, (_, i) => region(`r${i}`, 10, 10));
    const result = applyAutoRunGuard(regions, { maxRegions: 3, maxRegionAreaPx: 10000 });
    expect(result.accepted.length + result.rejectedOverCap.length).toBe(5);
    expect(result.message).not.toBeNull();
  });

  it("returns an empty accepted list without throwing for an empty input", () => {
    const result = applyAutoRunGuard([], { maxRegions: 10, maxRegionAreaPx: 1000 });
    expect(result.accepted).toHaveLength(0);
    expect(result.message).toBeNull();
  });
});
