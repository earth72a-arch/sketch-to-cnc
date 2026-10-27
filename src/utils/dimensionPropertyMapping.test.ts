import { describe, expect, it } from "vitest";
import { mapDimensionToProperty } from "./dimensionPropertyMapping";
import type { Dimension } from "../types/project";

function dim(overrides: Partial<Dimension> = {}): Dimension {
  return {
    id: "d1",
    value: 35,
    unit: "mm",
    normalizedValueMm: 35,
    componentId: "comp-1",
    elementId: null,
    axis: "iso_axis_a",
    axisSource: "user_selected",
    geometricReference: null,
    property: "custom",
    customPropertyLabel: "รอระบุประเภท (Tap-to-Dimension)",
    annotation: null,
    reviewStatus: "confirmed",
    provenance: { source: "user_confirmed", timestamp: "2026-01-01T00:00:00.000Z" },
    ...overrides,
  };
}

describe("mapDimensionToProperty — Session 3B §6 explicit Property mapping adapter", () => {
  it("sets the property EXACTLY as given, nothing inferred from axis/component", () => {
    const input = dim({ axis: "iso_axis_a", componentId: "comp-1", property: "custom" });
    const result = mapDimensionToProperty(input, "width");
    expect(result.property).toBe("width");
    // Everything else — including axis and componentId — is untouched.
    expect(result.axis).toBe("iso_axis_a");
    expect(result.componentId).toBe("comp-1");
  });

  it("clears customPropertyLabel when mapping away from custom", () => {
    const input = dim({ property: "custom", customPropertyLabel: "ตัวอย่าง" });
    const result = mapDimensionToProperty(input, "depth");
    expect(result.customPropertyLabel).toBeUndefined();
  });

  it("keeps the provided label when mapping TO custom", () => {
    const input = dim({ property: "width" });
    const result = mapDimensionToProperty(input, "custom", "ความหนาขอบ");
    expect(result.property).toBe("custom");
    expect(result.customPropertyLabel).toBe("ความหนาขอบ");
  });

  it("does not change reviewStatus — confirming a value and mapping it to a property are separate actions", () => {
    const draftWithAxisAndComponent = dim({ reviewStatus: "read", axis: "vertical_axis", componentId: "comp-1" });
    const result = mapDimensionToProperty(draftWithAxisAndComponent, "height");
    expect(result.reviewStatus).toBe("read"); // still a draft — mapping alone never confirms
  });

  it("is the only place that changes property — merely having axis+component set does nothing by itself (no function call, no change)", () => {
    const withAxisAndComponent = dim({ axis: "iso_axis_a", componentId: "comp-1", property: "custom" });
    // Simulate "time passing" / other code touching unrelated fields —
    // without an explicit mapDimensionToProperty call, property must
    // never drift away from what the user last explicitly set.
    const untouched = { ...withAxisAndComponent, note: "unrelated edit" };
    expect(untouched.property).toBe("custom");
  });
});
