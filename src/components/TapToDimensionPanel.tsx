import { useEffect, useState } from "react";
import { generateId } from "../utils/id";
import { toMillimeters } from "../utils/units";
import { provenanceSourceForTapInput } from "../utils/provenance";
import { markerRegionCenter, pointToMarkerRegion } from "../utils/markers";
import { suggestAxisOptions, AXIS_LABEL_TH } from "../utils/axisSuggestion";
import type { Component, Dimension, DimensionAxis, LengthUnit, Point, ReviewStatus } from "../types/project";

/**
 * Session 3A/3B — V1 Tap-to-Dimension workflow: the project's PRIMARY
 * way to capture a dimension (CLAUDE.md: never infer a measurement from
 * pixels — OCR stays an experimental, opt-in reference tool, never the
 * source of a real value). Tap a position on the image, type the
 * number, optionally pick a Direction/Axis and a Component/Element,
 * confirm — reuses the EXISTING Dimension record shape,
 * `requestPointPlacement`, and the existing ADD_DIMENSION/
 * UPDATE_DIMENSION/SET_DIMENSION_STATUS/DELETE_DIMENSION actions.
 *
 * Session 3B: Axis and Component are both OPTIONAL and independently
 * editable later — this panel never requires either to save a Draft,
 * never guesses a Component from tap position alone, and never writes
 * `property` (Width/Height/Depth/...) — that stays a separate, explicit
 * step in the Dimension Editor (see `utils/dimensionPropertyMapping.ts`).
 */

const AXIS_OPTIONS: DimensionAxis[] = ["unassigned", "vertical_axis", "iso_axis_a", "iso_axis_b", "custom"];

interface TapToDimensionPanelProps {
  dimensions: Dimension[];
  components: Component[];
  /** Session 3B §4 — ISO Recognition's detected axis angles, if
   * available, used ONLY to compute suggested axis hints (never written
   * in without the user tapping a suggestion). */
  isoAxisCentroidsDeg: readonly number[] | null;
  onAddDimension: (dimension: Dimension) => void;
  onUpdateDimension: (id: string, patch: Partial<Dimension>) => void;
  onDeleteDimension: (id: string) => void;
  onSetStatus: (id: string, status: ReviewStatus) => void;
  onRequestPointPlacement: (onCapture: (point: Point) => void) => void;
  onCancelPlacement: () => void;
  imageLoaded: boolean;
  focusDimensionId?: string | null;
  onFocusConsumed?: () => void;
}

interface PendingEntry {
  /** null while editing an EXISTING marker's value (position unchanged). */
  point: Point | null;
  editingId: string | null;
}

const EMPTY_FORM = {
  value: "",
  unit: "mm" as LengthUnit,
  axis: "unassigned" as DimensionAxis,
  customAxisLabel: "",
  componentId: "",
};

export function TapToDimensionPanel({
  dimensions,
  components,
  isoAxisCentroidsDeg,
  onAddDimension,
  onUpdateDimension,
  onDeleteDimension,
  onSetStatus,
  onRequestPointPlacement,
  onCancelPlacement,
  imageLoaded,
  focusDimensionId,
  onFocusConsumed,
}: TapToDimensionPanelProps) {
  const [tapModeActive, setTapModeActive] = useState(false);
  const [pending, setPending] = useState<PendingEntry | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const tapDimensions = dimensions.filter((d) => !!d.annotation);
  const suggestedAxes = suggestAxisOptions(isoAxisCentroidsDeg);

  function armNextTap() {
    onRequestPointPlacement((point) => {
      setPending({ point, editingId: null });
      setForm(EMPTY_FORM);
    });
  }

  function handleToggleTapMode() {
    if (tapModeActive) {
      setTapModeActive(false);
      onCancelPlacement();
    } else {
      setTapModeActive(true);
      armNextTap();
    }
  }

  // Leaving this tab (unmount) must not leave a stale placement request
  // armed on another tab — a tap there would otherwise silently create
  // an unexpected dimension marker.
  useEffect(() => {
    return () => onCancelPlacement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEditValue(dim: Dimension) {
    setTapModeActive(false);
    onCancelPlacement();
    setPending({ point: null, editingId: dim.id });
    setForm({
      value: String(dim.value),
      unit: dim.unit,
      axis: dim.axis,
      customAxisLabel: dim.customAxisLabel ?? "",
      componentId: dim.componentId ?? "",
    });
  }

  useEffect(() => {
    if (!focusDimensionId) return;
    const target = dimensions.find((d) => d.id === focusDimensionId);
    if (target) startEditValue(target);
    onFocusConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDimensionId]);

  function parsedValue(): number | null {
    const trimmed = form.value.trim();
    if (trimmed.length === 0) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  function acceptSuggestedAxis(axis: DimensionAxis) {
    setForm((prev) => ({ ...prev, axis }));
  }

  function handleSave() {
    const numeric = parsedValue();
    if (numeric === null || !pending) return;
    const customAxisLabel = form.axis === "custom" ? form.customAxisLabel.trim() || undefined : undefined;

    if (pending.editingId) {
      onUpdateDimension(pending.editingId, {
        value: numeric,
        unit: form.unit,
        normalizedValueMm: toMillimeters(numeric, form.unit),
        axis: form.axis,
        // A value the user just typed/changed in this popup IS a user
        // selection, whatever the axis dropdown currently shows —
        // never silently left as "suggested" once a human has touched
        // the record through this save action.
        axisSource: "user_selected",
        customAxisLabel,
        componentId: form.componentId || null,
      });
    } else if (pending.point) {
      const reviewStatus: ReviewStatus = "read";
      onAddDimension({
        id: generateId("dimension"),
        value: numeric,
        unit: form.unit,
        normalizedValueMm: toMillimeters(numeric, form.unit),
        componentId: form.componentId || null,
        elementId: null,
        axis: form.axis,
        axisSource: "user_selected",
        customAxisLabel,
        geometricReference: null,
        property: "custom",
        customPropertyLabel: "รอระบุประเภท (Tap-to-Dimension)",
        annotation: { viewId: null, region: pointToMarkerRegion(pending.point) },
        reviewStatus,
        provenance: {
          source: provenanceSourceForTapInput(reviewStatus),
          note: "กรอกผ่าน Tap-to-Dimension — ตัวเลขในภาพ Procreate เป็นข้อมูลอ้างอิงเท่านั้น ไม่ได้ใช้คำนวณค่านี้ Axis/Component ที่เลือก (ถ้ามี) เป็นข้อมูลอ้างอิงทิศทาง/ชิ้นงาน ไม่ใช่การกำหนด Width/Height/Depth",
          timestamp: new Date().toISOString(),
        },
      });
    }

    setPending(null);
    setForm(EMPTY_FORM);
    if (tapModeActive) armNextTap();
  }

  function handleCancelEntry() {
    setPending(null);
    setForm(EMPTY_FORM);
    if (tapModeActive) armNextTap();
  }

  const canSave = parsedValue() !== null;

  return (
    <div className="panel tap-to-dimension-panel">
      <h2>Tap-to-Dimension (V1)</h2>
      <p className="panel__hint">
        แตะตำแหน่งตัวเลข Dimension บนภาพ แล้วกรอกค่าด้วยตัวเองผ่านแป้นตัวเลข — ตัวเลขที่เห็นในภาพ Procreate
        เป็นข้อมูลอ้างอิงเท่านั้น ระบบจะไม่อ่านหรือเดาค่าให้ Axis และ Component เป็นทางเลือก ไม่บังคับ และไม่ใช่การกำหนด
        Width/Height/Depth
      </p>

      {!imageLoaded && <p className="panel__warning">นำเข้าภาพก่อนจึงจะใช้งาน Tap-to-Dimension ได้</p>}

      <div className="form-actions">
        <button
          type="button"
          aria-pressed={tapModeActive}
          disabled={!imageLoaded}
          className={tapModeActive ? "tap-to-dimension-panel__mode-btn tap-to-dimension-panel__mode-btn--active" : "tap-to-dimension-panel__mode-btn"}
          onClick={handleToggleTapMode}
        >
          {tapModeActive ? "โหมด Tap-to-Dimension: เปิดอยู่ — แตะภาพเพื่อวางจุด" : "เปิดโหมด Tap-to-Dimension"}
        </button>
      </div>

      {pending && (
        <div className="tap-to-dimension-panel__popup">
          <p>
            {pending.editingId
              ? "แก้ไข Dimension นี้"
              : `ตำแหน่งที่แตะ: x:${Math.round(pending.point!.x)} y:${Math.round(pending.point!.y)}`}
          </p>
          <div className="form-grid">
            <label>
              ค่าตัวเลข (Value)
              <input
                type="number"
                inputMode="decimal"
                step="any"
                autoFocus
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSave) handleSave();
                }}
              />
            </label>
            <label>
              หน่วย (Unit)
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as LengthUnit })}>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
              </select>
            </label>

            <label>
              แกน/ทิศทาง (Axis / Direction)
              <select value={form.axis} onChange={(e) => setForm({ ...form, axis: e.target.value as DimensionAxis })}>
                {AXIS_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {AXIS_LABEL_TH[a]}
                  </option>
                ))}
              </select>
            </label>

            {form.axis === "custom" && (
              <label>
                ชื่อทิศทาง (Custom Direction Label)
                <input
                  value={form.customAxisLabel}
                  onChange={(e) => setForm({ ...form, customAxisLabel: e.target.value })}
                />
              </label>
            )}

            {suggestedAxes.length > 0 && (
              <div className="tap-to-dimension-panel__suggestions">
                <small>แนะนำจาก ISO Recognition (แตะเพื่อเลือก — ระบบไม่เลือกให้อัตโนมัติ):</small>
                <div className="form-actions">
                  {suggestedAxes.map((s) => (
                    <button key={s.axis} type="button" onClick={() => acceptSuggestedAxis(s.axis)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label>
              Component / Element ที่เกี่ยวข้อง
              <select value={form.componentId} onChange={(e) => setForm({ ...form, componentId: e.target.value })}>
                <option value="">(ยังไม่ระบุ)</option>
                {components.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </label>

            <div className="form-actions">
              <button type="button" onClick={handleSave} disabled={!canSave}>
                บันทึกเป็น Draft
              </button>
              <button type="button" onClick={handleCancelEntry}>
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      <ul className="entity-list">
        {tapDimensions.map((d) => {
          const center = markerRegionCenter(d.annotation!.region);
          const isConfirmed = d.reviewStatus === "confirmed";
          const component = components.find((c) => c.id === d.componentId);
          const axisLabel = d.axis === "custom" ? d.customAxisLabel || "Custom Direction" : AXIS_LABEL_TH[d.axis];
          return (
            <li key={d.id} className="entity-list__item">
              <button type="button" onClick={() => startEditValue(d)}>
                <strong>
                  {d.value} {d.unit}
                </strong>{" "}
                · x:{Math.round(center.x)} y:{Math.round(center.y)}
                {" · "}
                <span className={isConfirmed ? "status-badge status-badge--confirmed" : "status-badge"}>
                  {isConfirmed ? "Confirmed" : "Draft"}
                </span>
                <br />
                <small>
                  Axis: {axisLabel} · Component: {component ? component.name : "(ยังไม่ระบุ)"}
                </small>
              </button>
              {!isConfirmed && (
                <button type="button" onClick={() => onSetStatus(d.id, "confirmed")}>
                  ยืนยัน
                </button>
              )}
              <button type="button" className="entity-list__delete" onClick={() => onDeleteDimension(d.id)}>
                ลบ
              </button>
            </li>
          );
        })}
        {tapDimensions.length === 0 && <li className="entity-list__empty">ยังไม่มี Dimension จากการแตะภาพ</li>}
      </ul>
    </div>
  );
}
