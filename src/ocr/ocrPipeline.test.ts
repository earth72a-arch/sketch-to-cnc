import { describe, expect, it } from "vitest";
import { effectiveCropPadding } from "./ocrPipeline";

describe("effectiveCropPadding (Session 2B.4 — resolution-aware crop padding)", () => {
  it("uses the fixed minimum padding for a small region where the fraction would be smaller", () => {
    // 50x58 region (this project's real "35" region at 1522px width) —
    // 15% of 50 is 7.5, which already exceeds the old fixed 4px.
    expect(effectiveCropPadding(50, 58, 4, 0.15)).toBe(8); // round(50*0.15)=7.5->8
  });

  it("uses the fixed minimum when the fraction would be smaller than it", () => {
    expect(effectiveCropPadding(10, 10, 4, 0.15)).toBe(4); // round(10*0.15)=1.5->2, but min is 4
  });

  it("scales padding up for a larger (higher-resolution) region", () => {
    // Same digit at ~2.3x the resolution (matching the iPad test's
    // 3508/1522 ratio) — padding should grow roughly proportionally,
    // not stay pinned at the small-image fixed minimum.
    const smallRegionPadding = effectiveCropPadding(50, 58, 4, 0.15);
    const largeRegionPadding = effectiveCropPadding(115, 133, 4, 0.15);
    expect(largeRegionPadding).toBeGreaterThan(smallRegionPadding);
  });

  it("uses the SMALLER region dimension, not the larger one", () => {
    // A wide, short region (e.g. "35" at 50x20) should scale padding
    // off the 20, not the 50 — otherwise a thin strip gets an
    // oversized padding relative to its own height.
    const padding = effectiveCropPadding(50, 20, 4, 0.15);
    expect(padding).toBe(4); // round(20*0.15)=3 -> below the 4px floor
  });

  it("never returns less than the fixed minimum, even for a 0-size region", () => {
    expect(effectiveCropPadding(0, 0, 4, 0.15)).toBe(4);
  });
});
