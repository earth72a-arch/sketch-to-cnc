import { describe, expect, it } from "vitest";
import { suggestAxisOptions } from "./axisSuggestion";

describe("suggestAxisOptions — Session 3B ISO axis hints (suggestions only, never auto-applied)", () => {
  it("returns no suggestions when ISO Recognition found nothing", () => {
    expect(suggestAxisOptions(null)).toEqual([]);
    expect(suggestAxisOptions([])).toEqual([]);
  });

  it("labels the angle closest to 90° as Vertical Axis, the rest as A/B in ascending order", () => {
    const options = suggestAxisOptions([29.6, 90.8, 151.9]);
    expect(options).toHaveLength(3);
    expect(options[0]).toMatchObject({ axis: "vertical_axis", angleDeg: 90.8 });
    expect(options[1]).toMatchObject({ axis: "iso_axis_a", angleDeg: 29.6 });
    expect(options[2]).toMatchObject({ axis: "iso_axis_b", angleDeg: 151.9 });
  });

  it("is order-independent in the input (same result regardless of input array order)", () => {
    const a = suggestAxisOptions([151.9, 29.6, 90.8]);
    const b = suggestAxisOptions([90.8, 151.9, 29.6]);
    expect(a).toEqual(b);
  });

  it("includes the angle value in the label (never a bare 'A'/'B' with no evidence shown)", () => {
    const options = suggestAxisOptions([0, 60, 120]);
    for (const o of options) {
      expect(o.label).toContain(o.angleDeg.toFixed(1));
    }
  });
});
