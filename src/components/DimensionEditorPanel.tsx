import { useEffect, useState } from "react";
import { generateId } from "../utils/id";
import { toMillimeters } from "../utils/units";
import { provenanceSourceForStatus } from "../utils/provenance";
import { markerRegionCenter, pointToMarkerRegion } from "../utils/markers";
import type {
  Component,
  Dimension,
  DimensionProperty,
  DrawingView,
  LengthUnit,
  Point,
  Region,
  ReviewStatus,
} from "../types/project";

const PROPERTY_OPTIONS: DimensionProperty[] = [
  "width",
  "height",
  "depth",
  "offset",
  "overhang",
  "spacing",
  "custom",
];

const STATUS_OPTIONS: ReviewStatus[] = [
  "read",
  "confirmed",
  "derived",
  "rule",
  "missing",
  "ambiguous",
  "conflict",
];

interface DimensionEditorPanelProps {
  dimensions: Dimension[];
  components: Component[];
  views: DrawingView[];
  onAddDimension: (dimension: Dimension) => void;
  onUpdateDimension: (id: string, patch: Partial<Dimension>) => void;
  onDeleteDimension: (id: string) => void;
  onSetStatus: (id: string, status: ReviewStatus) => void;
  onRequestPointPlacement: (onCapture: (point: Point) => void) => void;
  focusDimensionId?: string | null;
  onFocusConsumed?: () => void;
}

interface FormState {
  value: string;
  unit: LengthUnit;
  property: DimensionProperty;
  customPropertyLabel: string;
  componentId: string;
  viewId: string;
  region: Region | null;
  reviewStatus: ReviewStatus;
  note: string;
}

const INITIAL_FORM: FormState = {
  value: "",
  unit: "mm",
  property: "width",
  customPropertyLabel: "",
  componentId: "",
  viewId: "",
  region: null,
  reviewStatus: "read",
  note: "",
};

export function DimensionEditorPanel({
  dimensions,
  components,
  views,
  onAddDimension,
  onUpdateDimension,
  onDeleteDimension,
  onSetStatus,
  onRequestPointPlacement,
  focusDimensionId,
  onFocusConsumed,
}: DimensionEditorPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  function resetForm() {
    setEditingId(null);
    setForm(INITIAL_FORM);
  }

  function startEdit(dim: Dimension) {
    setEditingId(dim.id);
    setForm({
      value: String(dim.value),
      unit: dim.unit,
      property: dim.property,
      customPropertyLabel: dim.customPropertyLabel ?? "",
      componentId: dim.componentId ?? "",
      viewId: dim.annotation?.viewId ?? "",
      region: dim.annotation?.region ?? null,
      reviewStatus: dim.reviewStatus,
      note: dim.note ?? "",
    });
  }

  useEffect(() => {
    if (!focusDimensionId) return;
    const target = dimensions.find((d) => d.id === focusDimensionId);
    if (target) startEdit(target);
    onFocusConsumed?.();
  }, [focusDimensionId]);

  function handleSubmit() {
    const numericValue = Number(form.value);
    if (!Number.isFinite(numericValue)) return;

    const payload: Dimension = {
      id: editingId ?? generateId("dimension"),
      value: numericValue,
      unit: form.unit,
      normalizedValueMm: toMillimeters(numericValue, form.unit),
      componentId: form.componentId || null,
      property: form.property,
      customPropertyLabel:
        form.property === "custom" ? form.customPropertyLabel.trim() : undefined,
      annotation:
        form.viewId && form.region
          ? { viewId: form.viewId, region: form.region }
          : null,
      reviewStatus: form.reviewStatus,
      provenance: {
        source: provenanceSourceForStatus(form.reviewStatus),
        timestamp: new Date().toISOString(),
      },
      note: form.note.trim() || undefined,
    };

    if (editingId) {
      onUpdateDimension(editingId, payload);
    } else {
      onAddDimension(payload);
    }
    resetForm();
  }

  return (
    <div className="panel">
      <h2>Dimension Editor</h2>
      <p className="panel__hint">
        ป้อนค่ามิติที่อ่านได้จากภาพด้วยตนเอง — ระบบจะไม่เดาค่าที่ขาดหายไป
      </p>

      <div className="form-grid">
        <label>
          ค่าตัวเลข (Value)
          <input
            type="number"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
        </label>

        <label>
          หน่วย (Unit)
          <select
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value as LengthUnit })}
          >
            <option value="mm">mm</option>
            <option value="cm">cm</option>
          </select>
        </label>

        <label>
          คุณสมบัติ (Property)
          <select
            value={form.property}
            onChange={(e) => setForm({ ...form, property: e.target.value as DimensionProperty })}
          >
            {PROPERTY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        {form.property === "custom" && (
          <label>
            ชื่อคุณสมบัติ (Custom Property Label)
            <input
              value={form.customPropertyLabel}
              onChange={(e) => setForm({ ...form, customPropertyLabel: e.target.value })}
            />
          </label>
        )}

        <label>
          ส่วนประกอบเป้าหมาย (Target Component)
          <select
            value={form.componentId}
            onChange={(e) => setForm({ ...form, componentId: e.target.value })}
          >
            <option value="">(ยังไม่ระบุ)</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          มุมมองที่เกี่ยวข้อง (Drawing View)
          <select
            value={form.viewId}
            onChange={(e) => setForm({ ...form, viewId: e.target.value })}
          >
            <option value="">(ยังไม่ระบุ)</option>
            {views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>ตำแหน่งอ้างอิงบนภาพ (Annotation Marker)</legend>
          {form.region ? (
            <p>
              {(() => {
                const center = markerRegionCenter(form.region);
                return `ตำแหน่งจุด: x:${Math.round(center.x)} y:${Math.round(center.y)}`;
              })()}
            </p>
          ) : (
            <p>ยังไม่ได้ระบุตำแหน่งบนภาพ</p>
          )}
          <button
            type="button"
            disabled={!form.viewId}
            onClick={() =>
              onRequestPointPlacement((point) =>
                setForm((prev) => ({ ...prev, region: pointToMarkerRegion(point) })),
              )
            }
          >
            แตะตำแหน่งบนภาพ
          </button>
          {!form.viewId && <small>เลือกมุมมองก่อนวางตำแหน่ง</small>}
        </fieldset>

        <label>
          สถานะตรวจสอบ (Review Status)
          <select
            value={form.reviewStatus}
            onChange={(e) => setForm({ ...form, reviewStatus: e.target.value as ReviewStatus })}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label>
          บันทึกเพิ่มเติม (Note)
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>

        <div className="form-actions">
          <button type="button" onClick={handleSubmit}>
            {editingId ? "บันทึกการแก้ไข" : "เพิ่มมิติ"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm}>
              ยกเลิก
            </button>
          )}
        </div>
      </div>

      <ul className="entity-list">
        {dimensions.map((d) => {
          const component = components.find((c) => c.id === d.componentId);
          return (
            <li key={d.id} className="entity-list__item">
              <button type="button" onClick={() => startEdit(d)}>
                <strong>
                  {d.value} {d.unit}
                </strong>{" "}
                ({d.property === "custom" ? d.customPropertyLabel : d.property}) →{" "}
                {component ? component.name : "(ยังไม่ผูก component)"}
                {" · "}
                <span className={`status-badge status-badge--${d.reviewStatus}`}>
                  {d.reviewStatus}
                </span>
                {d.annotation && " · 📍"}
              </button>
              {d.reviewStatus !== "confirmed" && (
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
        {dimensions.length === 0 && <li className="entity-list__empty">ยังไม่มีมิติ</li>}
      </ul>
    </div>
  );
}
