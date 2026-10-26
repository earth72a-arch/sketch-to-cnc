import { useState } from "react";
import { generateId } from "../utils/id";
import type {
  Component,
  DrawingView,
  Material,
  ReviewStatus,
} from "../types/project";

const TYPE_PRESETS = [
  "cabinet_body",
  "door_left",
  "door_right",
  "shelf",
  "side_panel",
  "custom",
] as const;

const STATUS_LABELS: Record<ReviewStatus, string> = {
  read: "Read",
  confirmed: "Confirmed",
  derived: "Derived",
  rule: "Rule",
  missing: "Missing",
  ambiguous: "Ambiguous",
  conflict: "Conflict",
};

interface ComponentEditorPanelProps {
  components: Component[];
  views: DrawingView[];
  materials: Material[];
  onAddComponent: (component: Component) => void;
  onUpdateComponent: (id: string, patch: Partial<Component>) => void;
  onDeleteComponent: (id: string) => void;
}

interface FormState {
  name: string;
  typePreset: string;
  customType: string;
  parentComponentId: string;
  viewIds: string[];
  materialId: string;
  requiresMaterial: boolean;
  reviewStatus: ReviewStatus;
}

const INITIAL_FORM: FormState = {
  name: "",
  typePreset: "cabinet_body",
  customType: "",
  parentComponentId: "",
  viewIds: [],
  materialId: "",
  requiresMaterial: true,
  reviewStatus: "read",
};

export function ComponentEditorPanel({
  components,
  views,
  materials,
  onAddComponent,
  onUpdateComponent,
  onDeleteComponent,
}: ComponentEditorPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  function startEdit(component: Component) {
    const isPreset = (TYPE_PRESETS as readonly string[]).includes(component.type);
    setEditingId(component.id);
    setForm({
      name: component.name,
      typePreset: isPreset ? component.type : "custom",
      customType: isPreset ? "" : component.type,
      parentComponentId: component.parentComponentId ?? "",
      viewIds: component.viewIds,
      materialId: component.materialId ?? "",
      requiresMaterial: component.requiresMaterial,
      reviewStatus: component.reviewStatus,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(INITIAL_FORM);
  }

  function handleSubmit() {
    const resolvedType =
      form.typePreset === "custom" ? form.customType.trim() : form.typePreset;
    if (!form.name.trim() || !resolvedType) return;

    const payload: Component = {
      id: editingId ?? generateId("component"),
      name: form.name.trim(),
      type: resolvedType,
      parentComponentId: form.parentComponentId || null,
      viewIds: form.viewIds,
      materialId: form.materialId || null,
      requiresMaterial: form.requiresMaterial,
      reviewStatus: form.reviewStatus,
    };

    if (editingId) {
      onUpdateComponent(editingId, payload);
    } else {
      onAddComponent(payload);
    }
    resetForm();
  }

  return (
    <div className="panel">
      <h2>Component Editor</h2>
      <p className="panel__hint">
        สร้างและแก้ไขส่วนประกอบของเฟอร์นิเจอร์ด้วยตนเอง (ไม่มีการตรวจจับอัตโนมัติ)
      </p>

      <div className="form-grid">
        <label>
          ชื่อส่วนประกอบ (Name)
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>

        <label>
          ประเภท (Type)
          <select
            value={form.typePreset}
            onChange={(e) => setForm({ ...form, typePreset: e.target.value })}
          >
            {TYPE_PRESETS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        {form.typePreset === "custom" && (
          <label>
            ระบุประเภท (Custom Type)
            <input
              value={form.customType}
              onChange={(e) => setForm({ ...form, customType: e.target.value })}
            />
          </label>
        )}

        <label>
          ส่วนประกอบหลัก (Parent Component)
          <select
            value={form.parentComponentId}
            onChange={(e) => setForm({ ...form, parentComponentId: e.target.value })}
          >
            <option value="">(ไม่มี)</option>
            {components
              .filter((c) => c.id !== editingId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>

        <label>
          วัสดุ (Material)
          <select
            value={form.materialId}
            onChange={(e) => setForm({ ...form, materialId: e.target.value })}
          >
            <option value="">(ยังไม่กำหนด)</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.requiresMaterial}
            onChange={(e) => setForm({ ...form, requiresMaterial: e.target.checked })}
          />
          ต้องกำหนดวัสดุก่อนอนุมัติ (Requires Material)
        </label>

        <label>
          สถานะตรวจสอบ (Review Status)
          <select
            value={form.reviewStatus}
            onChange={(e) => setForm({ ...form, reviewStatus: e.target.value as ReviewStatus })}
          >
            {Object.entries(STATUS_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>

        {views.length > 0 && (
          <fieldset>
            <legend>มุมมองที่เกี่ยวข้อง (Drawing Views)</legend>
            {views.map((v) => (
              <label key={v.id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.viewIds.includes(v.id)}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      viewIds: e.target.checked
                        ? [...prev.viewIds, v.id]
                        : prev.viewIds.filter((id) => id !== v.id),
                    }))
                  }
                />
                {v.label}
              </label>
            ))}
          </fieldset>
        )}

        <div className="form-actions">
          <button type="button" onClick={handleSubmit}>
            {editingId ? "บันทึกการแก้ไข" : "เพิ่มส่วนประกอบ"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm}>
              ยกเลิก
            </button>
          )}
        </div>
      </div>

      <ul className="entity-list">
        {components.map((c) => (
          <li key={c.id} className="entity-list__item">
            <button type="button" onClick={() => startEdit(c)}>
              <strong>{c.name}</strong> ({c.type}) · {STATUS_LABELS[c.reviewStatus]}
              {c.parentComponentId && (
                <>
                  {" "}
                  ← parent:{" "}
                  {components.find((p) => p.id === c.parentComponentId)?.name ?? "?"}
                </>
              )}
            </button>
            <button type="button" className="entity-list__delete" onClick={() => onDeleteComponent(c.id)}>
              ลบ
            </button>
          </li>
        ))}
        {components.length === 0 && <li className="entity-list__empty">ยังไม่มีส่วนประกอบ</li>}
      </ul>
    </div>
  );
}
