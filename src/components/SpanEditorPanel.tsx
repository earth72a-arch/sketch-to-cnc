import { useState } from "react";
import { generateId } from "../utils/id";
import type {
  Component,
  Dimension,
  DimensionSpan,
  DrawingView,
  Point,
  SpanAxis,
} from "../types/project";

const AXIS_OPTIONS: SpanAxis[] = ["x", "y", "z", "custom"];

interface SpanEditorPanelProps {
  spans: DimensionSpan[];
  dimensions: Dimension[];
  components: Component[];
  views: DrawingView[];
  onAddSpan: (span: DimensionSpan) => void;
  onDeleteSpan: (id: string) => void;
  onRequestPointPlacement: (onCapture: (point: Point) => void) => void;
}

interface FormState {
  axis: SpanAxis;
  viewId: string;
  componentId: string;
  dimensionId: string;
  parentSpanId: string;
  startPoint: Point | null;
  endPoint: Point | null;
}

const INITIAL_FORM: FormState = {
  axis: "x",
  viewId: "",
  componentId: "",
  dimensionId: "",
  parentSpanId: "",
  startPoint: null,
  endPoint: null,
};

export function SpanEditorPanel({
  spans,
  dimensions,
  components,
  views,
  onAddSpan,
  onDeleteSpan,
  onRequestPointPlacement,
}: SpanEditorPanelProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  function handleAdd() {
    onAddSpan({
      id: generateId("span"),
      viewId: form.viewId,
      axis: form.axis,
      startPoint: form.startPoint,
      endPoint: form.endPoint,
      componentId: form.componentId || null,
      dimensionId: form.dimensionId || null,
      parentSpanId: form.parentSpanId || null,
    });
    setForm(INITIAL_FORM);
  }

  return (
    <div className="panel">
      <h2>Dimension Span</h2>
      <p className="panel__hint">
        กำหนดช่วงการวัด (span) และระบุสายโซ่มิติ (chain) ด้วยตนเองเท่านั้น — ระบบจะไม่เดาความสัมพันธ์
        ของสายโซ่ให้อัตโนมัติ
      </p>

      <div className="form-grid">
        <label>
          แกน (Axis)
          <select value={form.axis} onChange={(e) => setForm({ ...form, axis: e.target.value as SpanAxis })}>
            {AXIS_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label>
          มุมมองที่เกี่ยวข้อง (Drawing View)
          <select value={form.viewId} onChange={(e) => setForm({ ...form, viewId: e.target.value })}>
            <option value="">(ยังไม่ระบุ)</option>
            {views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          ส่วนประกอบที่เกี่ยวข้อง (Component)
          <select value={form.componentId} onChange={(e) => setForm({ ...form, componentId: e.target.value })}>
            <option value="">(ยังไม่ระบุ)</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          มิติที่อ้างอิง (Dimension)
          <select value={form.dimensionId} onChange={(e) => setForm({ ...form, dimensionId: e.target.value })}>
            <option value="">(ยังไม่ระบุ)</option>
            {dimensions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.value} {d.unit} ({d.property})
              </option>
            ))}
          </select>
        </label>

        <label>
          สายโซ่หลัก (Parent Span)
          <select value={form.parentSpanId} onChange={(e) => setForm({ ...form, parentSpanId: e.target.value })}>
            <option value="">(ไม่เป็นส่วนของสายโซ่ใด)</option>
            {spans.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} ({s.axis})
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>จุดเริ่มต้น / จุดสิ้นสุด (Start / End Point)</legend>
          <p>
            start: {form.startPoint ? `${Math.round(form.startPoint.x)}, ${Math.round(form.startPoint.y)}` : "—"}
            {" · "}
            end: {form.endPoint ? `${Math.round(form.endPoint.x)}, ${Math.round(form.endPoint.y)}` : "—"}
          </p>
          <button
            type="button"
            onClick={() => onRequestPointPlacement((point) => setForm((prev) => ({ ...prev, startPoint: point })))}
          >
            ระบุจุดเริ่มต้นบนภาพ
          </button>
          <button
            type="button"
            onClick={() => onRequestPointPlacement((point) => setForm((prev) => ({ ...prev, endPoint: point })))}
          >
            ระบุจุดสิ้นสุดบนภาพ
          </button>
        </fieldset>

        <button type="button" onClick={handleAdd}>
          เพิ่ม Span
        </button>
      </div>

      <ul className="entity-list">
        {spans.map((s) => {
          const dim = dimensions.find((d) => d.id === s.dimensionId);
          return (
            <li key={s.id} className="entity-list__item">
              <span>
                <strong>{s.axis}</strong>
                {dim ? ` · ${dim.value} ${dim.unit}` : " · (ไม่ผูกมิติ)"}
                {s.parentSpanId ? ` · child of ${s.parentSpanId}` : ""}
              </span>
              <button type="button" className="entity-list__delete" onClick={() => onDeleteSpan(s.id)}>
                ลบ
              </button>
            </li>
          );
        })}
        {spans.length === 0 && <li className="entity-list__empty">ยังไม่มี span</li>}
      </ul>
    </div>
  );
}
