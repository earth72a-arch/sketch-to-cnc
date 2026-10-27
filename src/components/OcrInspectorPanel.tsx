import { useEffect, useRef, useState } from "react";
import type { OcrCandidate, OcrCandidateStatus, OcrUnit, TextRegionCandidate } from "../ocr/types";
import type { LoadedImage } from "./ImageViewer";

interface OcrInspectorPanelProps {
  image: LoadedImage | null;
  hasRecognitionResult: boolean;
  candidates: OcrCandidate[];
  busy: boolean;
  progress: { status: string; progress: number } | null;
  error: string | null;
  onRunAutoDetection: () => void;
  onRequestManualRegion: () => void;
  onUpdateCandidate: (id: string, patch: Partial<Pick<OcrCandidate, "userValue" | "userUnit" | "status" | "note">>) => void;
  onTransferToDraftDimension: (candidate: OcrCandidate) => void;
  onExportReport: () => void;
  onReleaseEngine: () => void;
  selectedCandidateId: string | null;
  onSelectCandidate: (id: string | null) => void;
}

const STATUS_LABEL_TH: Record<OcrCandidateStatus, string> = {
  read: "อ่านได้ (read)",
  ambiguous: "ไม่แน่ใจ (ambiguous)",
  confirmed: "ผู้ใช้ยืนยันว่าถูกต้อง",
  rejected: "ปฏิเสธ (false positive)",
};

function OcrCropThumbnail({ image, region }: { image: LoadedImage; region: TextRegionCandidate["region"] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const DEST_HEIGHT = 48;
  const destWidth = Math.max(16, Math.round((region.width / region.height) * DEST_HEIGHT));

  function draw() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.complete) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
  }

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image.url, region.x, region.y, region.width, region.height]);

  return (
    <>
      {/* Hidden full-res image used purely as a draw source — same URL
       * the main ImageViewer already loaded, no extra network fetch. */}
      <img
        ref={imgRef}
        src={image.url}
        alt=""
        style={{ display: "none" }}
        onLoad={draw}
      />
      <canvas ref={canvasRef} width={destWidth} height={DEST_HEIGHT} className="ocr-panel__thumbnail" />
    </>
  );
}

export function OcrInspectorPanel({
  image,
  hasRecognitionResult,
  candidates,
  busy,
  progress,
  error,
  onRunAutoDetection,
  onRequestManualRegion,
  onUpdateCandidate,
  onTransferToDraftDimension,
  onExportReport,
  onReleaseEngine,
  selectedCandidateId,
  onSelectCandidate,
}: OcrInspectorPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editUnit, setEditUnit] = useState<OcrUnit | "">("");

  function startEdit(candidate: OcrCandidate) {
    setEditingId(candidate.id);
    setEditValue(String(candidate.userValue ?? candidate.parsedValue ?? ""));
    setEditUnit(candidate.userUnit ?? candidate.parsedUnit ?? "");
  }

  function saveEdit(id: string) {
    const numeric = Number(editValue);
    onUpdateCandidate(id, {
      userValue: Number.isFinite(numeric) ? numeric : undefined,
      userUnit: editUnit || undefined,
    });
    setEditingId(null);
  }

  return (
    <div className="panel ocr-panel">
      <h2>Dimension OCR (Session 2B)</h2>
      <p className="panel__hint">
        พยายามอ่านตัวเลข Dimension จากสีมิติ (แดง) ด้วย OCR ในเบราว์เซอร์ล้วน — ผลลัพธ์ทุกรายการเป็นแค่ "ค่าที่อ่านได้"
        ต้องตรวจกับภาพต้นฉบับก่อนเสมอ ไม่มีการยืนยัน/ผูก component ให้อัตโนมัติ
      </p>

      {!image && <p className="panel__warning">นำเข้าภาพก่อนจึงจะใช้งาน OCR ได้</p>}
      {image && !hasRecognitionResult && (
        <p className="panel__warning">กรุณากด "ตรวจจับ (Run Detection)" ในแท็บ Recognition ก่อน เพื่อให้มี Dimension Color Mask</p>
      )}

      <div className="form-actions">
        <button type="button" onClick={onRunAutoDetection} disabled={!image || !hasRecognitionResult || busy}>
          {busy ? "กำลังอ่าน OCR…" : "ตรวจจับ Dimension Text อัตโนมัติ + OCR"}
        </button>
        <button type="button" onClick={onRequestManualRegion} disabled={!image || busy}>
          วาดพื้นที่เองแล้วอ่าน OCR
        </button>
        <button type="button" onClick={onExportReport} disabled={candidates.length === 0}>
          Export OCR Debug Report (JSON)
        </button>
        <button type="button" onClick={onReleaseEngine} disabled={busy}>
          ปิด OCR Engine (คืนหน่วยความจำ)
        </button>
      </div>

      {busy && progress && (
        <p className="panel__hint">
          สถานะ OCR engine: {progress.status} ({Math.round(progress.progress * 100)}%)
        </p>
      )}
      {error && <p className="panel__error">{error}</p>}

      <ul className="entity-list ocr-panel__candidate-list">
        {candidates.map((c) => {
          const effectiveValue = c.userValue ?? c.parsedValue;
          const effectiveUnit = c.userUnit ?? c.parsedUnit;
          const canTransfer = effectiveValue !== null && effectiveValue !== undefined && !!effectiveUnit && c.status !== "rejected";
          const isEditing = editingId === c.id;

          return (
            <li
              key={c.id}
              className={
                c.id === selectedCandidateId
                  ? "entity-list__item ocr-panel__candidate ocr-panel__candidate--selected"
                  : "entity-list__item ocr-panel__candidate"
              }
              onClick={() => onSelectCandidate(c.id)}
            >
              {image && <OcrCropThumbnail image={image} region={c.region.region} />}
              <div className="ocr-panel__candidate-body">
                <div>
                  <strong>"{c.rawText || "(ไม่มีข้อความ)"}"</strong>
                  {" · มุม "}
                  {c.orientationDeg}°{" · ความมั่นใจ "}
                  {c.confidence === null ? "ไม่ทราบ" : `${c.confidence.toFixed(0)}%`}
                  {" · "}
                  <span className={`status-badge status-badge--${c.status}`}>{STATUS_LABEL_TH[c.status]}</span>
                </div>

                {isEditing ? (
                  <div className="form-grid">
                    <label>
                      ค่า
                      <input value={editValue} onChange={(e) => setEditValue(e.target.value)} type="number" />
                    </label>
                    <label>
                      หน่วย
                      <select value={editUnit} onChange={(e) => setEditUnit(e.target.value as OcrUnit | "")}>
                        <option value="">(ยังไม่ระบุ)</option>
                        <option value="mm">mm</option>
                        <option value="cm">cm</option>
                      </select>
                    </label>
                    <div className="form-actions">
                      <button type="button" onClick={() => saveEdit(c.id)}>
                        บันทึก
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}>
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    ค่าที่ใช้ตรวจสอบ: {effectiveValue ?? "(ไม่มี)"} {effectiveUnit ?? "(ไม่ระบุหน่วย)"}
                    {c.alternatives.length > 0 && (
                      <span className="ocr-panel__alternatives">
                        {" "}
                        · อ่านได้อีกแบบ: {c.alternatives.map((a) => `"${a.text}"`).join(", ")}
                      </span>
                    )}
                  </div>
                )}

                <div className="form-actions">
                  {!isEditing && (
                    <button type="button" onClick={() => startEdit(c)}>
                      แก้ค่า/หน่วย
                    </button>
                  )}
                  {c.status !== "confirmed" && (
                    <button type="button" onClick={() => onUpdateCandidate(c.id, { status: "confirmed" })}>
                      ยืนยันว่าอ่านถูกต้อง
                    </button>
                  )}
                  {c.status !== "ambiguous" && (
                    <button type="button" onClick={() => onUpdateCandidate(c.id, { status: "ambiguous" })}>
                      ไม่แน่ใจ
                    </button>
                  )}
                  {c.status !== "rejected" && (
                    <button type="button" onClick={() => onUpdateCandidate(c.id, { status: "rejected" })}>
                      ปฏิเสธ (ไม่ใช่ตัวเลข)
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!canTransfer}
                    title={canTransfer ? undefined : "ต้องมีทั้งค่าตัวเลขและหน่วยก่อนจึงย้ายเป็น Dimension ได้"}
                    onClick={() => onTransferToDraftDimension(c)}
                  >
                    ย้ายไปเป็น Draft Dimension
                  </button>
                </div>
              </div>
            </li>
          );
        })}
        {candidates.length === 0 && <li className="entity-list__empty">ยังไม่มีผล OCR</li>}
      </ul>
    </div>
  );
}
