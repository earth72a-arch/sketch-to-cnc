import { useMemo, useState } from "react";
import "./App.css";
import { useProject } from "./state/ProjectContext";
import {
  ImageViewer,
  type LineOverlaySegment,
  type LoadedImage,
  type MaskLayer,
  type PlacementRequest,
  type RegionOverlayItem,
  type ViewerMarker,
} from "./components/ImageViewer";
import { ImportPanel, type ImportResult } from "./components/ImportPanel";
import { ViewManagerPanel } from "./components/ViewManagerPanel";
import { ComponentEditorPanel } from "./components/ComponentEditorPanel";
import { DimensionEditorPanel } from "./components/DimensionEditorPanel";
import { SpanEditorPanel } from "./components/SpanEditorPanel";
import { MaterialsPanel } from "./components/MaterialsPanel";
import { ValidationPanel } from "./components/ValidationPanel";
import { ProjectToolbar } from "./components/ProjectToolbar";
import { ExportBlockingPanel } from "./components/ExportBlockingPanel";
import { RecognitionInspectorPanel } from "./components/RecognitionInspectorPanel";
import { OcrInspectorPanel } from "./components/OcrInspectorPanel";
import { markerRegionCenter } from "./utils/markers";
import { buildApprovedFurnitureSpec, triggerJsonDownload } from "./utils/serialization";
import { slugifyFileName } from "./utils/filename";
import { generateId } from "./utils/id";
import { toMillimeters } from "./utils/units";
import type { ValidationIssue } from "./utils/validation";
import type { Point, ProjectFile, Region } from "./types/project";
import { createDefaultPalette } from "./recognition/palette";
import { DEFAULT_RECOGNITION_OPTIONS, runRecognitionPipeline } from "./recognition/pipeline";
import { loadPixelBufferFromUrl } from "./recognition/imageDataAdapter";
import { buildRecognitionReport, serializeRecognitionReport } from "./recognition/report";
import type { ColorCategory, Palette, PixelBuffer, RecognitionResult } from "./recognition/types";
import { detectDimensionTextRegions, createManualTextRegion } from "./ocr/textRegionDetection";
import { DEFAULT_RECOGNIZE_OPTIONS, recognizeTextRegions } from "./ocr/ocrPipeline";
import { terminateOcrEngine } from "./ocr/tesseractEngine";
import { pixelBufferToOffscreenCanvas } from "./ocr/canvasImageAdapter";
import { buildOcrDebugReport, serializeOcrDebugReport } from "./ocr/report";
import type { OcrCandidate } from "./ocr/types";

const TESSERACT_WORKER_PATH = `${import.meta.env.BASE_URL}tesseract/worker.min.js`;
const TESSERACT_CORE_PATH = `${import.meta.env.BASE_URL}tesseract/core/tesseract-core-lstm.js`;
const TESSERACT_LANG_PATH = `${import.meta.env.BASE_URL}tesseract/lang-data`;

type Tab =
  | "views"
  | "components"
  | "dimensions"
  | "spans"
  | "materials"
  | "validation"
  | "recognition";

const TABS: { id: Tab; label: string }[] = [
  { id: "views", label: "Views" },
  { id: "components", label: "Components" },
  { id: "dimensions", label: "Dimensions" },
  { id: "spans", label: "Spans" },
  { id: "materials", label: "Materials" },
  { id: "validation", label: "Validation" },
  { id: "recognition", label: "Recognition" },
];

const AXIS_COLORS_HEX = ["#00bcd4", "#ff9800", "#8bc34a"];
const UNCLASSIFIED_AXIS_COLOR_HEX = "#9e9e9e";
const UNCLASSIFIED_MASK_COLOR = { r: 255, g: 0, b: 255 };

export function App() {
  const { project, dispatch } = useProject();
  const [tab, setTab] = useState<Tab>("views");
  const [loadedImage, setLoadedImage] = useState<LoadedImage | null>(null);
  const [mismatchWarning, setMismatchWarning] = useState<{ expected: string; actual: string } | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<PlacementRequest | null>(null);
  const [focusDimensionId, setFocusDimensionId] = useState<string | null>(null);
  const [focusComponentId, setFocusComponentId] = useState<string | null>(null);
  const [exportIssues, setExportIssues] = useState<ValidationIssue[] | null>(null);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

  const [palette, setPalette] = useState<Palette>(createDefaultPalette());
  const [pixelBuffer, setPixelBuffer] = useState<PixelBuffer | null>(null);
  const [recognitionResult, setRecognitionResult] = useState<RecognitionResult | null>(null);
  const [recognitionBusy, setRecognitionBusy] = useState(false);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const [visibleMaskCategories, setVisibleMaskCategories] = useState<Set<ColorCategory>>(new Set());
  const [showUnclassifiedMask, setShowUnclassifiedMask] = useState(false);
  const [showLineOverlay, setShowLineOverlay] = useState(true);
  const [showOriginalOnly, setShowOriginalOnly] = useState(false);

  const [ocrCandidates, setOcrCandidates] = useState<OcrCandidate[]>([]);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<{ status: string; progress: number } | null>(null);
  const [ocrSelectedCandidateId, setOcrSelectedCandidateId] = useState<string | null>(null);
  const [ocrProcessingTimeMs, setOcrProcessingTimeMs] = useState(0);

  const dimensionMarkers = useMemo<ViewerMarker[]>(
    () =>
      project.dimensions
        .filter((d) => d.annotation)
        .map((d, index) => ({
          id: d.id,
          point: markerRegionCenter(d.annotation!.region),
          label: String(index + 1),
        })),
    [project.dimensions],
  );

  function handleImported(result: ImportResult) {
    setLoadedImage(result.loadedImage);
    setPixelBuffer(null);
    setRecognitionResult(null);
    if (!project.sourceImage) {
      dispatch({
        type: "IMPORT_IMAGE",
        fileName: result.file.name,
        width: result.loadedImage.width,
        height: result.loadedImage.height,
        sha256: result.sha256,
      });
      setMismatchWarning(null);
      return;
    }
    if (result.sha256.toLowerCase() === project.sourceImage.sha256.toLowerCase()) {
      setMismatchWarning(null);
    } else {
      setMismatchWarning({ expected: project.sourceImage.sha256, actual: result.sha256 });
    }
  }

  function handleLoadProject(loaded: ProjectFile) {
    dispatch({ type: "LOAD_PROJECT", project: loaded });
    setLoadedImage(null);
    setMismatchWarning(null);
    setActiveViewId(null);
    setPixelBuffer(null);
    setRecognitionResult(null);
  }

  async function handleRunRecognition() {
    if (!loadedImage) return;
    setRecognitionBusy(true);
    setRecognitionError(null);
    try {
      let buffer = pixelBuffer;
      if (!buffer) {
        buffer = await loadPixelBufferFromUrl(loadedImage.url);
        setPixelBuffer(buffer);
      }
      setRecognitionResult(runRecognitionPipeline(buffer, palette));
    } catch (e) {
      setRecognitionError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการตรวจจับ");
    } finally {
      setRecognitionBusy(false);
    }
  }

  function handleExportRecognitionReport() {
    if (!recognitionResult) return;
    const report = buildRecognitionReport(
      recognitionResult,
      {
        fileName: project.sourceImage?.fileName ?? "unknown.png",
        width: recognitionResult.width,
        height: recognitionResult.height,
        sha256: project.sourceImage?.sha256 ?? "",
      },
      palette,
      DEFAULT_RECOGNITION_OPTIONS,
    );
    triggerJsonDownload(
      `${slugifyFileName(project.projectName)}.recognition-report.json`,
      serializeRecognitionReport(report),
    );
  }

  async function ensurePixelBuffer(): Promise<PixelBuffer | null> {
    if (!loadedImage) return null;
    if (pixelBuffer) return pixelBuffer;
    const buffer = await loadPixelBufferFromUrl(loadedImage.url);
    setPixelBuffer(buffer);
    return buffer;
  }

  async function handleRunOcrAutoDetection() {
    if (!loadedImage || !recognitionResult) return;
    setOcrBusy(true);
    setOcrError(null);
    setOcrProgress(null);
    const started = Date.now();
    try {
      const buffer = await ensurePixelBuffer();
      if (!buffer) return;
      const regions = detectDimensionTextRegions(
        recognitionResult.classification.masks.dimension,
        buffer.width,
        buffer.height,
      );
      const newCandidates = await recognizeTextRegions(buffer, regions, {
        ...DEFAULT_RECOGNIZE_OPTIONS,
        isoAxisCentroidsDeg: recognitionResult.axisClustering.axisCentroidsDeg,
        sourceImageSha256: project.sourceImage?.sha256 ?? "",
        toImageLike: pixelBufferToOffscreenCanvas,
        engineOptions: {
          workerPath: TESSERACT_WORKER_PATH,
          corePath: TESSERACT_CORE_PATH,
          langPath: TESSERACT_LANG_PATH,
          onProgress: (status, progressValue) => setOcrProgress({ status, progress: progressValue }),
        },
      });
      setOcrCandidates((prev) => [...prev, ...newCandidates]);
    } catch (e) {
      setOcrError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการอ่าน OCR");
    } finally {
      setOcrProcessingTimeMs((prev) => prev + (Date.now() - started));
      setOcrBusy(false);
      setOcrProgress(null);
    }
  }

  function handleRequestManualOcrRegion() {
    requestRegionPlacement(async (region) => {
      setOcrBusy(true);
      setOcrError(null);
      const started = Date.now();
      try {
        const buffer = await ensurePixelBuffer();
        if (!buffer) return;
        const manualRegion = createManualTextRegion(region);
        const newCandidates = await recognizeTextRegions(buffer, [manualRegion], {
          ...DEFAULT_RECOGNIZE_OPTIONS,
          isoAxisCentroidsDeg: recognitionResult?.axisClustering.axisCentroidsDeg ?? null,
          sourceImageSha256: project.sourceImage?.sha256 ?? "",
          toImageLike: pixelBufferToOffscreenCanvas,
          engineOptions: {
            workerPath: TESSERACT_WORKER_PATH,
            corePath: TESSERACT_CORE_PATH,
            langPath: TESSERACT_LANG_PATH,
          },
        });
        setOcrCandidates((prev) => [...prev, ...newCandidates]);
      } catch (e) {
        setOcrError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการอ่าน OCR");
      } finally {
        setOcrProcessingTimeMs((prev) => prev + (Date.now() - started));
        setOcrBusy(false);
      }
    });
  }

  function handleUpdateOcrCandidate(
    id: string,
    patch: Partial<Pick<OcrCandidate, "userValue" | "userUnit" | "status" | "note">>,
  ) {
    setOcrCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function handleTransferOcrCandidateToDraftDimension(candidate: OcrCandidate) {
    const value = candidate.userValue ?? candidate.parsedValue;
    const unit = candidate.userUnit ?? candidate.parsedUnit;
    if (value === null || value === undefined || !unit) return;

    dispatch({
      type: "ADD_DIMENSION",
      dimension: {
        id: generateId("dimension"),
        value,
        unit,
        normalizedValueMm: toMillimeters(value, unit),
        componentId: null,
        property: "custom",
        customPropertyLabel: "ค่าจาก OCR (ยังไม่จัดประเภท)",
        annotation: null,
        reviewStatus: "read",
        provenance: {
          source: "user_read",
          note: `ได้จาก OCR อัตโนมัติ (Session 2B) — ข้อความที่อ่านได้: "${candidate.rawText}", ความมั่นใจ: ${
            candidate.confidence === null ? "ไม่ทราบ" : `${candidate.confidence.toFixed(0)}%`
          }, มุม: ${candidate.orientationDeg}°, ตำแหน่งพิกเซล: x=${candidate.region.region.x}, y=${candidate.region.region.y}, w=${candidate.region.region.width}, h=${candidate.region.region.height}. ต้องตรวจกับภาพต้นฉบับก่อนยืนยัน.`,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  function handleExportOcrReport() {
    if (ocrCandidates.length === 0) return;
    const report = buildOcrDebugReport(
      ocrCandidates,
      {
        fileName: project.sourceImage?.fileName ?? "unknown.png",
        width: recognitionResult?.width ?? loadedImage?.width ?? 0,
        height: recognitionResult?.height ?? loadedImage?.height ?? 0,
        sha256: project.sourceImage?.sha256 ?? "",
      },
      ocrProcessingTimeMs,
    );
    triggerJsonDownload(
      `${slugifyFileName(project.projectName)}.ocr-debug-report.json`,
      serializeOcrDebugReport(report),
    );
  }

  async function handleReleaseOcrEngine() {
    await terminateOcrEngine();
  }

  function toggleMaskCategory(category: ColorCategory) {
    setVisibleMaskCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const recognitionMaskLayers = useMemo<MaskLayer[]>(() => {
    if (tab !== "recognition" || showOriginalOnly || !recognitionResult) return [];
    const layers: MaskLayer[] = [];
    for (const category of visibleMaskCategories) {
      layers.push({
        id: category,
        mask: recognitionResult.classification.masks[category],
        color: palette[category].color,
      });
    }
    if (showUnclassifiedMask) {
      layers.push({
        id: "unclassified",
        mask: recognitionResult.classification.unclassifiedMask,
        color: UNCLASSIFIED_MASK_COLOR,
      });
    }
    return layers;
  }, [tab, showOriginalOnly, recognitionResult, visibleMaskCategories, showUnclassifiedMask, palette]);

  const recognitionLineOverlay = useMemo<LineOverlaySegment[]>(() => {
    if (tab !== "recognition" || showOriginalOnly || !showLineOverlay || !recognitionResult) return [];
    return recognitionResult.lines.map((line, idx) => {
      const axisGroup = recognitionResult.axisClustering.assignments[idx];
      return {
        id: line.id,
        start: line.start,
        end: line.end,
        colorHex: axisGroup === null ? UNCLASSIFIED_AXIS_COLOR_HEX : AXIS_COLORS_HEX[axisGroup],
      };
    });
  }, [tab, showOriginalOnly, showLineOverlay, recognitionResult]);

  const ocrRegionOverlay = useMemo<RegionOverlayItem[]>(() => {
    if (tab !== "recognition") return [];
    return ocrCandidates.map((c) => ({
      id: c.id,
      region: c.region.region,
      colorHex:
        c.status === "rejected"
          ? "#9e9e9e"
          : c.status === "confirmed"
            ? "#4caf50"
            : c.status === "ambiguous"
              ? "#ff9800"
              : "#2196f3",
      label: c.rawText || undefined,
      selected: c.id === ocrSelectedCandidateId,
      onSelect: () => setOcrSelectedCandidateId(c.id),
    }));
  }, [tab, ocrCandidates, ocrSelectedCandidateId]);

  function requestRegionPlacement(onCapture: (region: Region) => void) {
    setPlacement({
      kind: "region",
      onCapture: (region) => {
        onCapture(region);
        setPlacement(null);
      },
    });
  }

  function requestPointPlacement(onCapture: (point: Point) => void) {
    setPlacement({
      kind: "point",
      onCapture: (point) => {
        onCapture(point);
        setPlacement(null);
      },
    });
  }

  function focusDimension(id: string) {
    setTab("dimensions");
    setFocusDimensionId(id);
  }

  function focusComponent(id: string) {
    setTab("components");
    setFocusComponentId(id);
  }

  function handleExportApproved() {
    const result = buildApprovedFurnitureSpec(project);
    if (!result.ok) {
      setExportIssues(result.issues);
      setExportSuccessMessage(null);
      return;
    }
    triggerJsonDownload(
      `${slugifyFileName(project.projectName)}.approved.json`,
      JSON.stringify(result.spec, null, 2),
    );
    setExportIssues(null);
    setExportSuccessMessage("ส่งออก Approved Furniture Spec สำเร็จ");
  }

  function handleJumpToIssue(issue: ValidationIssue) {
    if (issue.entityType === "dimension") {
      focusDimension(issue.entityId);
    } else if (issue.entityType === "component") {
      focusComponent(issue.entityId);
    }
    setExportIssues(null);
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>Sketch to CNC</h1>
        <ProjectToolbar
          project={project}
          onRename={(name) => dispatch({ type: "RENAME_PROJECT", name })}
          onLoadProject={handleLoadProject}
          onExportApproved={handleExportApproved}
        />
        {exportSuccessMessage && (
          <span className="export-success-banner">{exportSuccessMessage}</span>
        )}
      </header>

      {exportIssues && (
        <ExportBlockingPanel
          issues={exportIssues}
          onClose={() => setExportIssues(null)}
          onJumpToIssue={handleJumpToIssue}
        />
      )}

      <main className="app__main">
        <section className="app__viewer">
          {!loadedImage && (
            <ImportPanel
              onImported={handleImported}
              expectedSha256={project.sourceImage?.sha256 ?? null}
              mismatchWarning={mismatchWarning}
              onDismissMismatch={() => setMismatchWarning(null)}
            />
          )}
          {loadedImage && mismatchWarning && (
            <div className="panel__warning app__mismatch-banner">
              <strong>คำเตือน: ภาพไม่ตรงกับภาพต้นฉบับของโปรเจกต์</strong>
              <button type="button" onClick={() => setMismatchWarning(null)}>
                รับทราบ
              </button>
            </div>
          )}
          <ImageViewer
            image={loadedImage}
            views={project.views}
            activeViewId={activeViewId}
            placement={placement}
            onCancelPlacement={() => setPlacement(null)}
            markers={dimensionMarkers}
            onSelectMarker={focusDimension}
            maskLayers={recognitionMaskLayers}
            lineOverlay={recognitionLineOverlay}
            regionOverlay={ocrRegionOverlay}
          />
        </section>

        <section className="app__side-panel">
          <nav className="app__tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={t.id === tab ? "app__tab app__tab--active" : "app__tab"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="app__tab-content">
            {tab === "views" && (
              <ViewManagerPanel
                views={project.views}
                components={project.components}
                activeViewId={activeViewId}
                onSelectView={setActiveViewId}
                onAddView={(view) => dispatch({ type: "ADD_VIEW", view })}
                onDeleteView={(id) => dispatch({ type: "DELETE_VIEW", id })}
                onRequestRegionPlacement={requestRegionPlacement}
              />
            )}

            {tab === "components" && (
              <ComponentEditorPanel
                components={project.components}
                views={project.views}
                materials={project.materials}
                onAddComponent={(component) => dispatch({ type: "ADD_COMPONENT", component })}
                onUpdateComponent={(id, patch) => dispatch({ type: "UPDATE_COMPONENT", id, patch })}
                onDeleteComponent={(id) => dispatch({ type: "DELETE_COMPONENT", id })}
                focusComponentId={focusComponentId}
                onFocusConsumed={() => setFocusComponentId(null)}
              />
            )}

            {tab === "dimensions" && (
              <DimensionEditorPanel
                dimensions={project.dimensions}
                components={project.components}
                views={project.views}
                onAddDimension={(dimension) => dispatch({ type: "ADD_DIMENSION", dimension })}
                onUpdateDimension={(id, patch) => dispatch({ type: "UPDATE_DIMENSION", id, patch })}
                onDeleteDimension={(id) => dispatch({ type: "DELETE_DIMENSION", id })}
                onSetStatus={(id, status) => dispatch({ type: "SET_DIMENSION_STATUS", id, status })}
                onRequestPointPlacement={requestPointPlacement}
                focusDimensionId={focusDimensionId}
                onFocusConsumed={() => setFocusDimensionId(null)}
              />
            )}

            {tab === "spans" && (
              <SpanEditorPanel
                spans={project.spans}
                dimensions={project.dimensions}
                components={project.components}
                views={project.views}
                onAddSpan={(span) => dispatch({ type: "ADD_SPAN", span })}
                onDeleteSpan={(id) => dispatch({ type: "DELETE_SPAN", id })}
                onRequestPointPlacement={requestPointPlacement}
              />
            )}

            {tab === "materials" && (
              <MaterialsPanel
                materials={project.materials}
                onUpdateMaterial={(id, patch) => dispatch({ type: "UPDATE_MATERIAL", id, patch })}
              />
            )}

            {tab === "validation" && <ValidationPanel project={project} />}

            {tab === "recognition" && (
              <RecognitionInspectorPanel
                image={loadedImage}
                imageMeta={project.sourceImage ? { fileName: project.sourceImage.fileName, sha256: project.sourceImage.sha256 } : null}
                palette={palette}
                onPaletteChange={setPalette}
                visibleCategories={visibleMaskCategories}
                onToggleCategory={toggleMaskCategory}
                showUnclassifiedMask={showUnclassifiedMask}
                onToggleUnclassifiedMask={() => setShowUnclassifiedMask((v) => !v)}
                showLineOverlay={showLineOverlay}
                onToggleLineOverlay={() => setShowLineOverlay((v) => !v)}
                showOriginalOnly={showOriginalOnly}
                onToggleShowOriginalOnly={() => setShowOriginalOnly((v) => !v)}
                result={recognitionResult}
                busy={recognitionBusy}
                error={recognitionError}
                onRunDetection={handleRunRecognition}
                onExportReport={handleExportRecognitionReport}
              />
            )}

            {tab === "recognition" && (
              <OcrInspectorPanel
                image={loadedImage}
                hasRecognitionResult={!!recognitionResult}
                candidates={ocrCandidates}
                busy={ocrBusy}
                progress={ocrProgress}
                error={ocrError}
                onRunAutoDetection={handleRunOcrAutoDetection}
                onRequestManualRegion={handleRequestManualOcrRegion}
                onUpdateCandidate={handleUpdateOcrCandidate}
                onTransferToDraftDimension={handleTransferOcrCandidateToDraftDimension}
                onExportReport={handleExportOcrReport}
                onReleaseEngine={handleReleaseOcrEngine}
                selectedCandidateId={ocrSelectedCandidateId}
                onSelectCandidate={setOcrSelectedCandidateId}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
