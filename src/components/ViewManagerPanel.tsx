import { useState } from "react";
import { generateId } from "../utils/id";
import type {
  AssemblyState,
  Component,
  DrawingView,
  DrawingViewType,
  Region,
} from "../types/project";

const VIEW_TYPE_LABELS: Record<DrawingViewType, string> = {
  isometric_assembly: "Isometric Assembly",
  isometric_without_doors: "Isometric Without Doors",
  detail_view: "Detail View",
  custom: "Custom View",
};

const ASSEMBLY_STATE_LABELS: Record<AssemblyState, string> = {
  with_doors: "ประกอบพร้อมบานประตู",
  without_doors: "ประกอบโดยไม่มีบานประตู",
  custom: "กำหนดเอง",
};

interface ViewManagerPanelProps {
  views: DrawingView[];
  components: Component[];
  activeViewId: string | null;
  onSelectView: (id: string | null) => void;
  onAddView: (view: DrawingView) => void;
  onDeleteView: (id: string) => void;
  onRequestRegionPlacement: (onCapture: (region: Region) => void) => void;
}

const EMPTY_REGION: Region = { x: 0, y: 0, width: 100, height: 100 };

export function ViewManagerPanel({
  views,
  components,
  activeViewId,
  onSelectView,
  onAddView,
  onDeleteView,
  onRequestRegionPlacement,
}: ViewManagerPanelProps) {
  const [type, setType] = useState<DrawingViewType>("isometric_assembly");
  const [label, setLabel] = useState(VIEW_TYPE_LABELS["isometric_assembly"]);
  const [assemblyState, setAssemblyState] = useState<AssemblyState>("with_doors");
  const [region, setRegion] = useState<Region>(EMPTY_REGION);
  const [componentIds, setComponentIds] = useState<string[]>([]);

  function resetForm() {
    setType("isometric_assembly");
    setLabel(VIEW_TYPE_LABELS["isometric_assembly"]);
    setAssemblyState("with_doors");
    setRegion(EMPTY_REGION);
    setComponentIds([]);
  }

  function handleAdd() {
    onAddView({
      id: generateId("view"),
      type,
      label: label.trim() || VIEW_TYPE_LABELS[type],
      region,
      assemblyState,
      componentIds,
    });
    resetForm();
  }

  return (
    <div className="panel">
      <h2>View Manager</h2>
      <p className="panel__hint">
        สร้างมุมมองของภาพสเก็ตช์ด้วยตนเอง — ระบุพื้นที่บนภาพต้นฉบับสำหรับแต่ละมุมมอง
      </p>

      <div className="form-grid">
        <label>
          ประเภทมุมมอง (View Type)
          <select
            value={type}
            onChange={(e) => {
              const next = e.target.value as DrawingViewType;
              setType(next);
              setLabel(VIEW_TYPE_LABELS[next]);
            }}
          >
            {Object.entries(VIEW_TYPE_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>

        <label>
          ชื่อมุมมอง (Label)
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>

        <label>
          สถานะการประกอบ (Assembly State)
          <select
            value={assemblyState}
            onChange={(e) => setAssemblyState(e.target.value as AssemblyState)}
          >
            {Object.entries(ASSEMBLY_STATE_LABELS).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>พื้นที่บนภาพ (Region, หน่วย px ของภาพต้นฉบับ)</legend>
          <div className="region-fields">
            <label>
              X
              <input
                type="number"
                value={region.x}
                onChange={(e) => setRegion({ ...region, x: Number(e.target.value) })}
              />
            </label>
            <label>
              Y
              <input
                type="number"
                value={region.y}
                onChange={(e) => setRegion({ ...region, y: Number(e.target.value) })}
              />
            </label>
            <label>
              Width
              <input
                type="number"
                value={region.width}
                onChange={(e) =>
                  setRegion({ ...region, width: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Height
              <input
                type="number"
                value={region.height}
                onChange={(e) =>
                  setRegion({ ...region, height: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => onRequestRegionPlacement((captured) => setRegion(captured))}
          >
            วาดพื้นที่บนภาพ
          </button>
        </fieldset>

        {components.length > 0 && (
          <fieldset>
            <legend>ส่วนประกอบที่เกี่ยวข้อง (Related Components)</legend>
            {components.map((c) => (
              <label key={c.id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={componentIds.includes(c.id)}
                  onChange={(e) =>
                    setComponentIds((prev) =>
                      e.target.checked
                        ? [...prev, c.id]
                        : prev.filter((id) => id !== c.id),
                    )
                  }
                />
                {c.name}
              </label>
            ))}
          </fieldset>
        )}

        <button type="button" onClick={handleAdd}>
          เพิ่มมุมมองใหม่
        </button>
      </div>

      <ul className="entity-list">
        {views.map((view) => (
          <li
            key={view.id}
            className={view.id === activeViewId ? "entity-list__item entity-list__item--active" : "entity-list__item"}
          >
            <button type="button" onClick={() => onSelectView(view.id === activeViewId ? null : view.id)}>
              <strong>{view.label}</strong> ({VIEW_TYPE_LABELS[view.type]})
              <br />
              region: {Math.round(view.region.x)},{Math.round(view.region.y)} {Math.round(view.region.width)}×{Math.round(view.region.height)}
              {" · "}
              {ASSEMBLY_STATE_LABELS[view.assemblyState]}
            </button>
            <button
              type="button"
              className="entity-list__delete"
              onClick={() => onDeleteView(view.id)}
            >
              ลบ
            </button>
          </li>
        ))}
        {views.length === 0 && <li className="entity-list__empty">ยังไม่มีมุมมอง</li>}
      </ul>
    </div>
  );
}
