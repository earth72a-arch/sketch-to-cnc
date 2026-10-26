import type { Material } from "../types/project";

interface MaterialsPanelProps {
  materials: Material[];
  onUpdateMaterial: (id: string, patch: Partial<Material>) => void;
}

export function MaterialsPanel({ materials, onUpdateMaterial }: MaterialsPanelProps) {
  return (
    <div className="panel">
      <h2>Materials</h2>
      <p className="panel__hint">
        วัสดุเริ่มต้นของโปรเจกต์ — ความหนาจริง (actual thickness) จะไม่ถูกกำหนดจนกว่าจะตรวจสอบแล้ว
      </p>
      <ul className="entity-list">
        {materials.map((m) => (
          <li key={m.id} className="entity-list__item entity-list__item--material">
            <strong>{m.name}</strong>
            <span>Nominal: {m.nominalThicknessMm} mm</span>
            <label>
              Actual thickness (mm)
              <input
                type="number"
                value={m.actualThicknessMm ?? ""}
                placeholder="ยังไม่ตรวจสอบ"
                onChange={(e) => {
                  const raw = e.target.value;
                  onUpdateMaterial(m.id, {
                    actualThicknessMm: raw === "" ? null : Number(raw),
                  });
                }}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={m.actualThicknessVerified}
                disabled={m.actualThicknessMm === null}
                onChange={(e) =>
                  onUpdateMaterial(m.id, { actualThicknessVerified: e.target.checked })
                }
              />
              ตรวจสอบความหนาจริงแล้ว (Verified)
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
