import { COLOR_CATEGORIES, CATEGORY_LABELS_TH } from "../recognition/types";
import type { ColorCategory, Palette, RecognitionResult } from "../recognition/types";
import { rgbToHex, hexToRgb } from "../recognition/colorHex";
import type { LoadedImage } from "./ImageViewer";

const AXIS_COLORS_HEX = ["#00bcd4", "#ff9800", "#8bc34a"];
const UNCLASSIFIED_AXIS_COLOR_HEX = "#9e9e9e";

interface RecognitionInspectorPanelProps {
  image: LoadedImage | null;
  imageMeta: { fileName: string; sha256: string } | null;
  palette: Palette;
  onPaletteChange: (next: Palette) => void;
  visibleCategories: Set<ColorCategory>;
  onToggleCategory: (category: ColorCategory) => void;
  showUnclassifiedMask: boolean;
  onToggleUnclassifiedMask: () => void;
  showLineOverlay: boolean;
  onToggleLineOverlay: () => void;
  showOriginalOnly: boolean;
  onToggleShowOriginalOnly: () => void;
  result: RecognitionResult | null;
  busy: boolean;
  error: string | null;
  onRunDetection: () => void;
  onExportReport: () => void;
}

export function RecognitionInspectorPanel({
  image,
  imageMeta,
  palette,
  onPaletteChange,
  visibleCategories,
  onToggleCategory,
  showUnclassifiedMask,
  onToggleUnclassifiedMask,
  showLineOverlay,
  onToggleLineOverlay,
  showOriginalOnly,
  onToggleShowOriginalOnly,
  result,
  busy,
  error,
  onRunDetection,
  onExportReport,
}: RecognitionInspectorPanelProps) {
  const countPerAxis: [number, number, number] = [0, 0, 0];
  let unclassifiedAxisCount = 0;
  if (result) {
    for (const assignment of result.axisClustering.assignments) {
      if (assignment === null) unclassifiedAxisCount++;
      else countPerAxis[assignment]++;
    }
  }

  return (
    <div className="panel recognition-panel">
      <h2>Recognition Inspector</h2>
      <p className="panel__hint">
        ตรวจจับสีเส้นและแนวแกน ISO ด้วยกฎที่กำหนดตายตัว (ไม่ใช่ AI) — ใช้เพื่อ "ตรวจสอบด้วยสายตา" เท่านั้น
        ผลลัพธ์นี้ไม่ถูกนำไปสร้าง Component หรือ Dimension ให้อัตโนมัติ
      </p>

      {!image && <p className="panel__warning">นำเข้าภาพก่อนจึงจะใช้งาน Recognition Inspector ได้</p>}

      {image && (
        <p>
          Image Resolution: {image.width} × {image.height} px
          {imageMeta && (
            <>
              {" · SHA-256: "}
              <code>{imageMeta.sha256.slice(0, 12)}…</code>
            </>
          )}
        </p>
      )}

      <fieldset>
        <legend>Palette / Color Convention (ปรับรหัสสีและ Tolerance ได้)</legend>
        <table className="recognition-palette-table">
          <thead>
            <tr>
              <th>แสดง Mask</th>
              <th>ประเภท</th>
              <th>สี</th>
              <th>Tolerance</th>
            </tr>
          </thead>
          <tbody>
            {COLOR_CATEGORIES.map((category) => (
              <tr key={category}>
                <td>
                  <input
                    type="checkbox"
                    checked={visibleCategories.has(category)}
                    onChange={() => onToggleCategory(category)}
                    aria-label={`แสดง mask ของ ${CATEGORY_LABELS_TH[category]}`}
                  />
                </td>
                <td>{CATEGORY_LABELS_TH[category]}</td>
                <td>
                  <input
                    type="color"
                    value={rgbToHex(palette[category].color)}
                    onChange={(e) =>
                      onPaletteChange({
                        ...palette,
                        [category]: { ...palette[category], color: hexToRgb(e.target.value) },
                      })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={441}
                    value={palette[category].tolerance}
                    onChange={(e) =>
                      onPaletteChange({
                        ...palette,
                        [category]: { ...palette[category], tolerance: Number(e.target.value) },
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <label className="checkbox-row">
          <input type="checkbox" checked={showUnclassifiedMask} onChange={onToggleUnclassifiedMask} />
          แสดงพิกเซลที่จำแนกไม่ได้ (Unclassified)
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={showLineOverlay} onChange={onToggleLineOverlay} />
          แสดงเส้นที่ตรวจพบ (Detected Line Overlay)
        </label>
      </fieldset>

      <div className="form-actions">
        <button type="button" onClick={onRunDetection} disabled={!image || busy}>
          {busy ? "กำลังตรวจจับ…" : "ตรวจจับ (Run Detection)"}
        </button>
        <button
          type="button"
          aria-pressed={showOriginalOnly}
          className={showOriginalOnly ? "image-viewer__toolbar-btn--active" : undefined}
          onClick={onToggleShowOriginalOnly}
        >
          {showOriginalOnly ? "กำลังแสดงภาพต้นฉบับ" : "แสดงภาพต้นฉบับอย่างเดียว"}
        </button>
        <button type="button" onClick={onExportReport} disabled={!result}>
          Export Recognition Report (JSON)
        </button>
      </div>

      {error && <p className="panel__error">{error}</p>}

      {result && (
        <div className="recognition-summary">
          <p>Processing Time: {result.processingTimeMs.toFixed(1)} ms</p>
          <table className="recognition-palette-table">
            <thead>
              <tr>
                <th>ประเภท</th>
                <th>พิกเซลที่จำแนกได้</th>
                <th>จำนวนเส้นที่ตรวจพบ</th>
              </tr>
            </thead>
            <tbody>
              {COLOR_CATEGORIES.map((category) => (
                <tr key={category}>
                  <td>{CATEGORY_LABELS_TH[category]}</td>
                  <td>{result.classification.counts[category].toLocaleString()}</td>
                  <td>{result.lines.filter((l) => l.category === category).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            พิกเซลที่จำแนกไม่ได้ (Unclassified): {result.classification.counts.unclassified.toLocaleString()}
            {" · "}
            รูปทรงที่ไม่ใช่เส้นตรง (Rejected blobs): {result.rejectedBlobCount}
          </p>

          <h3>ISO Axis Classification</h3>
          {result.axisClustering.reason ? (
            <p className="panel__warning">{result.axisClustering.reason}</p>
          ) : (
            <ul className="recognition-axis-list">
              {result.axisClustering.axisCentroidsDeg!.map((angle, idx) => (
                <li key={idx}>
                  <span
                    className="recognition-axis-swatch"
                    style={{ background: AXIS_COLORS_HEX[idx] }}
                  />
                  แกน {idx + 1}: มุมประมาณ {angle.toFixed(1)}° — {countPerAxis[idx]} เส้น
                </li>
              ))}
              <li>
                <span
                  className="recognition-axis-swatch"
                  style={{ background: UNCLASSIFIED_AXIS_COLOR_HEX }}
                />
                จัดแกนไม่ได้ (Unclassified axis): {unclassifiedAxisCount} เส้น
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
