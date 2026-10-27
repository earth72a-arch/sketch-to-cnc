import type { OcrAutoRunGuardLimits, TextRegionCandidate } from "./types";

export interface TextRegionGuardResult {
  accepted: TextRegionCandidate[];
  /** Regions excluded by the area guard — oversized, likely a
   * mis-detected non-text blob rather than a number. */
  rejectedOversized: TextRegionCandidate[];
  /** Regions excluded purely because there were more candidates than
   * `maxRegions` — kept the largest (most legible) ones, see below. */
  rejectedOverCap: TextRegionCandidate[];
  /** Human-readable explanation of what happened, or null if nothing
   * was excluded — Session 2B.1 §6: never truncate silently. */
  message: string | null;
}

function regionArea(region: TextRegionCandidate): number {
  return region.region.width * region.region.height;
}

/**
 * Applies the Automatic OCR guard limits (Session 2B.1 §6) to a list of
 * auto-detected text regions BEFORE any OCR engine call is made —
 * bounds worst-case region count/crop size/rotation-attempt fan-out
 * without ever dropping data invisibly. When the cap trims the list,
 * the largest regions are kept (larger text is both more legible to
 * OCR and more likely to be a real multi-digit dimension than a stray
 * speck that slipped past the detector).
 */
export function applyAutoRunGuard(
  regions: TextRegionCandidate[],
  limits: OcrAutoRunGuardLimits,
): TextRegionGuardResult {
  const withinArea: TextRegionCandidate[] = [];
  const rejectedOversized: TextRegionCandidate[] = [];
  for (const region of regions) {
    if (regionArea(region) > limits.maxRegionAreaPx) {
      rejectedOversized.push(region);
    } else {
      withinArea.push(region);
    }
  }

  let accepted = withinArea;
  let rejectedOverCap: TextRegionCandidate[] = [];
  if (withinArea.length > limits.maxRegions) {
    const sortedByAreaDesc = [...withinArea].sort((a, b) => regionArea(b) - regionArea(a));
    accepted = sortedByAreaDesc.slice(0, limits.maxRegions);
    rejectedOverCap = sortedByAreaDesc.slice(limits.maxRegions);
  }

  const messages: string[] = [];
  if (rejectedOversized.length > 0) {
    messages.push(
      `ตัดบริเวณที่ใหญ่เกินเกณฑ์ (${limits.maxRegionAreaPx.toLocaleString()} px²) ออก ${rejectedOversized.length} บริเวณ — น่าจะเป็นรูปทรงที่ไม่ใช่ตัวเลข ไม่ใช่ข้อความ`,
    );
  }
  if (rejectedOverCap.length > 0) {
    messages.push(
      `พบ ${regions.length - rejectedOversized.length} บริเวณ เกินเกณฑ์สูงสุด ${limits.maxRegions} บริเวณต่อครั้ง — ประมวลผลเฉพาะ ${limits.maxRegions} บริเวณที่ใหญ่ที่สุด (อ่านง่ายกว่า) ส่วนที่เหลือ ${rejectedOverCap.length} บริเวณถูกข้าม สามารถอ่านเพิ่มทีละบริเวณด้วย "วาดพื้นที่เองแล้วอ่าน OCR"`,
    );
  }

  return {
    accepted,
    rejectedOversized,
    rejectedOverCap,
    message: messages.length > 0 ? messages.join(" ") : null,
  };
}
