import { describe, expect, it } from "vitest";
import { runRecognitionPipeline, DEFAULT_RECOGNITION_OPTIONS } from "./pipeline";
import { createDefaultPalette } from "./palette";
import { buildRecognitionReport, serializeRecognitionReport, RECOGNITION_ALGORITHM_VERSION } from "./report";
import { buildSyntheticLineImage } from "./fixtures/syntheticImages";

describe("buildRecognitionReport — Export Debug Results", () => {
  const palette = createDefaultPalette();
  const buffer = buildSyntheticLineImage({
    width: 100,
    height: 60,
    lines: [{ x1: 10, y1: 30, x2: 90, y2: 30, color: { r: 0, g: 0, b: 0 } }],
  });
  const result = runRecognitionPipeline(buffer, palette);
  const report = buildRecognitionReport(
    result,
    { fileName: "synthetic.png", width: 100, height: 60, sha256: "a".repeat(64) },
    palette,
    DEFAULT_RECOGNITION_OPTIONS,
  );

  it("includes image metadata, sha256, palette, algorithm version and timing", () => {
    expect(report.image.sha256).toHaveLength(64);
    expect(report.algorithmVersion).toBe(RECOGNITION_ALGORITHM_VERSION);
    expect(report.palette).toHaveLength(5);
    expect(report.palette[0]).toMatchObject({ category: "cabinet_structure", colorHex: "#000000" });
    expect(typeof report.processingTimeMs).toBe("number");
  });

  it("includes detected segments with axis assignment and unclassified counts", () => {
    expect(report.segments.length).toBeGreaterThan(0);
    expect(report.axisClustering).toHaveProperty("unclassifiedAxisCount");
    expect(report.axisClustering).toHaveProperty("countPerAxis");
  });

  it("never includes a real-world size field anywhere in the report", () => {
    const json = serializeRecognitionReport(report);
    const parsed = JSON.parse(json);
    expect(JSON.stringify(parsed)).not.toMatch(/"mm"|"realLength"|"actualLength"/);
    for (const segment of parsed.segments) {
      expect(segment).toHaveProperty("lengthPx");
      expect(segment).not.toHaveProperty("lengthMm");
    }
  });

  it("serializes to valid, parseable JSON", () => {
    expect(() => JSON.parse(serializeRecognitionReport(report))).not.toThrow();
  });
});
