import { useRef, useState } from "react";
import { sha256OfFile } from "../utils/hash";
import type { LoadedImage } from "./ImageViewer";

export interface ImportResult {
  file: File;
  loadedImage: LoadedImage;
  sha256: string;
}

interface ImportPanelProps {
  onImported: (result: ImportResult) => void;
  expectedSha256: string | null;
  mismatchWarning: { expected: string; actual: string } | null;
  onDismissMismatch: () => void;
}

function loadNaturalSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์ภาพได้"));
    img.src = url;
  });
}

export function ImportPanel({
  onImported,
  expectedSha256,
  mismatchWarning,
  onDismissMismatch,
}: ImportPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      if (file.type !== "image/png") {
        throw new Error("รองรับเฉพาะไฟล์ PNG เท่านั้น");
      }
      const url = URL.createObjectURL(file);
      const [size, sha256] = await Promise.all([
        loadNaturalSize(url),
        sha256OfFile(file),
      ]);
      onImported({
        file,
        loadedImage: { url, width: size.width, height: size.height },
        sha256,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "นำเข้าภาพไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel import-panel">
      <h2>นำเข้าภาพสเก็ตช์ (PNG)</h2>
      <p className="panel__hint">
        ภาพจะถูกประมวลผลในเบราว์เซอร์เท่านั้น — ไม่มีการส่งภาพไปยังเซิร์ฟเวอร์ภายนอก
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {busy && <p>กำลังประมวลผลภาพ…</p>}
      {error && <p className="panel__error">{error}</p>}
      {expectedSha256 && (
        <p className="panel__hint">
          โปรเจกต์นี้อ้างอิงภาพต้นฉบับ (SHA-256): <code>{expectedSha256.slice(0, 16)}…</code>
          {" "}กรุณานำเข้าไฟล์ภาพเดิมเพื่อตรวจสอบความถูกต้อง
        </p>
      )}
      {mismatchWarning && (
        <div className="panel__warning">
          <strong>คำเตือน: ภาพที่นำเข้าไม่ตรงกับภาพต้นฉบับของโปรเจกต์</strong>
          <p>
            ค่าแฮชที่คาดหวัง: <code>{mismatchWarning.expected.slice(0, 16)}…</code>
            <br />
            ค่าแฮชของไฟล์ที่นำเข้า: <code>{mismatchWarning.actual.slice(0, 16)}…</code>
          </p>
          <button type="button" onClick={onDismissMismatch}>
            รับทราบคำเตือนนี้
          </button>
        </div>
      )}
    </div>
  );
}
