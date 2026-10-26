import { useRef, useState } from "react";
import type { ProjectFile } from "../types/project";
import { parseProjectFile, serializeDraftProject, triggerJsonDownload } from "../utils/serialization";
import { slugifyFileName } from "../utils/filename";

interface ProjectToolbarProps {
  project: ProjectFile;
  onRename: (name: string) => void;
  onLoadProject: (project: ProjectFile) => void;
  onExportApproved: () => void;
}

export function ProjectToolbar({
  project,
  onRename,
  onLoadProject,
  onExportApproved,
}: ProjectToolbarProps) {
  const loadInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function handleSaveDraft() {
    const json = serializeDraftProject(project);
    triggerJsonDownload(`${slugifyFileName(project.projectName)}.draft.json`, json);
    setMessage("บันทึก Draft Project JSON แล้ว");
  }

  async function handleLoadFile(file: File) {
    const text = await file.text();
    const result = parseProjectFile(text);
    if (!result.ok || !result.project) {
      setMessage(result.error ?? "โหลดโปรเจกต์ไม่สำเร็จ");
      return;
    }
    onLoadProject(result.project);
    setMessage(
      result.project.sourceImage
        ? "โหลดโปรเจกต์แล้ว — กรุณานำเข้าไฟล์ภาพต้นฉบับอีกครั้งเพื่อตรวจสอบความถูกต้อง"
        : "โหลดโปรเจกต์แล้ว",
    );
  }

  return (
    <div className="project-toolbar">
      <label className="project-toolbar__name">
        ชื่อโปรเจกต์
        <input value={project.projectName} onChange={(e) => onRename(e.target.value)} />
      </label>

      <button type="button" onClick={handleSaveDraft}>
        บันทึก Draft Project JSON
      </button>

      <button type="button" onClick={() => loadInputRef.current?.click()}>
        โหลดโปรเจกต์ (JSON)
      </button>
      <input
        ref={loadInputRef}
        type="file"
        accept="application/json"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleLoadFile(file);
          e.target.value = "";
        }}
      />

      <button type="button" onClick={onExportApproved}>
        ส่งออก Approved Furniture Spec
      </button>

      {message && <span className="project-toolbar__message">{message}</span>}
    </div>
  );
}
