import { describe, expect, it } from "vitest";
import { buildOcrDebugReport, OCR_ALGORITHM_VERSION, serializeOcrDebugReport } from "./report";
import type { OcrCandidate } from "./types";

function makeCandidate(overrides: Partial<OcrCandidate> = {}): OcrCandidate {
  return {
    id: "ocr-candidate-1",
    region: { id: "ocr-region-1", region: { x: 0, y: 0, width: 10, height: 10 }, method: "auto-region", sourceComponentCount: 2 },
    rawText: "120",
    parsedValue: 120,
    parsedUnit: null,
    orientationDeg: 0,
    confidence: 80,
    alternatives: [],
    status: "read",
    sourceImageSha256: "a".repeat(64),
    engine: "tesseract",
    testMode: "auto-detection",
    ...overrides,
  };
}

describe("buildOcrDebugReport", () => {
  it("includes image metadata, algorithm version and per-candidate detail", () => {
    const report = buildOcrDebugReport([makeCandidate()], { fileName: "synthetic.png", width: 100, height: 60, sha256: "a".repeat(64) }, 123);
    expect(report.algorithmVersion).toBe(OCR_ALGORITHM_VERSION);
    expect(report.image.sha256).toHaveLength(64);
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0].rawText).toBe("120");
    expect(report.processingTimeMs).toBe(123);
  });

  it("counts candidates by status and by whether a value/unit was parsed", () => {
    const report = buildOcrDebugReport(
      [
        makeCandidate({ status: "read", parsedValue: 120, parsedUnit: "cm" }),
        makeCandidate({ status: "ambiguous", parsedValue: null, parsedUnit: null }),
        makeCandidate({ status: "rejected", parsedValue: 45, parsedUnit: null }),
      ],
      { fileName: "x.png", width: 10, height: 10, sha256: "b".repeat(64) },
      50,
    );
    expect(report.counts.totalCandidates).toBe(3);
    expect(report.counts.byStatus.read).toBe(1);
    expect(report.counts.byStatus.ambiguous).toBe(1);
    expect(report.counts.byStatus.rejected).toBe(1);
    expect(report.counts.withParsedValue).toBe(2);
    expect(report.counts.withParsedUnit).toBe(1);
  });

  it("never fabricates a value for an ambiguous candidate with none", () => {
    const report = buildOcrDebugReport(
      [makeCandidate({ status: "ambiguous", parsedValue: null, parsedUnit: null, rawText: "??" })],
      { fileName: "x.png", width: 10, height: 10, sha256: "c".repeat(64) },
      10,
    );
    expect(report.candidates[0].parsedValue).toBeNull();
  });

  it("serializes to valid JSON", () => {
    const report = buildOcrDebugReport([makeCandidate()], { fileName: "x.png", width: 10, height: 10, sha256: "d".repeat(64) }, 5);
    expect(() => JSON.parse(serializeOcrDebugReport(report))).not.toThrow();
  });
});
