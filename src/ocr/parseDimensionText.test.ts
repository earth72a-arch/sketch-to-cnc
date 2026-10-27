import { describe, expect, it } from "vitest";
import { parseDimensionText } from "./parseDimensionText";

describe("parseDimensionText", () => {
  const cases: Array<[string, number, string | null]> = [
    ["120", 120, null],
    ["60", 60, null],
    ["44", 44, null],
    ["45", 45, null],
    ["25", 25, null],
    ["1", 1, null],
    ["120 cm", 120, "cm"],
    ["450 mm", 450, "mm"],
    ["120cm", 120, "cm"],
    ["45.5", 45.5, null],
    ["45.5mm", 45.5, "mm"],
  ];

  for (const [input, value, unit] of cases) {
    it(`parses "${input}" as value=${value} unit=${unit}`, () => {
      const result = parseDimensionText(input);
      expect(result.value).toBe(value);
      expect(result.unit).toBe(unit);
      expect(result.ambiguous).toBe(false);
    });
  }

  it("never defaults a missing unit to mm or cm", () => {
    expect(parseDimensionText("120").unit).toBeNull();
  });

  it("is case-insensitive for the unit", () => {
    expect(parseDimensionText("120CM").unit).toBe("cm");
    expect(parseDimensionText("45Mm").unit).toBe("mm");
  });

  it("marks empty text as ambiguous with no fabricated value", () => {
    const result = parseDimensionText("   ");
    expect(result.ambiguous).toBe(true);
    expect(result.value).toBeNull();
    expect(result.unit).toBeNull();
  });

  it("marks noisy/garbage OCR text as ambiguous instead of extracting a number from inside it", () => {
    const result = parseDimensionText("l2O cm??");
    expect(result.ambiguous).toBe(true);
    expect(result.value).toBeNull();
  });

  it("marks text with an unrecognized unit as ambiguous", () => {
    const result = parseDimensionText("120 inch");
    expect(result.ambiguous).toBe(true);
  });

  it("marks multiple numbers in one string as ambiguous rather than guessing which is the dimension", () => {
    const result = parseDimensionText("120 45");
    expect(result.ambiguous).toBe(true);
  });
});
