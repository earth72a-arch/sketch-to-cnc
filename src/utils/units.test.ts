import { describe, expect, it } from "vitest";
import { isValidValueForProperty, toMillimeters } from "./units";

describe("toMillimeters", () => {
  it("passes mm through unchanged", () => {
    expect(toMillimeters(1200, "mm")).toBe(1200);
  });

  it("converts cm to mm", () => {
    expect(toMillimeters(120, "cm")).toBe(1200);
  });

  it("handles zero", () => {
    expect(toMillimeters(0, "mm")).toBe(0);
    expect(toMillimeters(0, "cm")).toBe(0);
  });
});

describe("isValidValueForProperty — invalid input handling", () => {
  it("rejects NaN and Infinity for any property", () => {
    expect(isValidValueForProperty(NaN, "width")).toBe(false);
    expect(isValidValueForProperty(Infinity, "width")).toBe(false);
  });

  it("requires strictly positive values for width/height/depth/spacing", () => {
    expect(isValidValueForProperty(0, "width")).toBe(false);
    expect(isValidValueForProperty(-10, "height")).toBe(false);
    expect(isValidValueForProperty(600, "width")).toBe(true);
  });

  it("allows zero for offset/overhang (flush fit is valid)", () => {
    expect(isValidValueForProperty(0, "overhang")).toBe(true);
    expect(isValidValueForProperty(0, "offset")).toBe(true);
    expect(isValidValueForProperty(-1, "overhang")).toBe(false);
  });

  it("allows positive custom values", () => {
    expect(isValidValueForProperty(10, "custom")).toBe(true);
    expect(isValidValueForProperty(-1, "custom")).toBe(false);
  });
});
