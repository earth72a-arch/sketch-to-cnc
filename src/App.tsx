import { useMemo, useState } from "react";
import "./App.css";
import { useProject } from "./state/ProjectContext";
import { ImageViewer, type LoadedImage, type PlacementRequest, type ViewerMarker } from "./components/ImageViewer";
import { ImportPanel, type ImportResult } from "./components/ImportPanel";
import { ViewManagerPanel } from "./components/ViewManagerPanel";
import { ComponentEditorPanel } from "./components/ComponentEditorPanel";
import { DimensionEditorPanel } from "./components/DimensionEditorPanel";
import { SpanEditorPanel } from "./components/SpanEditorPanel";
import { MaterialsPanel } from "./components/MaterialsPanel";
import { ValidationPanel } from "./components/ValidationPanel";
import { ProjectToolbar } from "./components/ProjectToolbar";
import { ExportBlockingPanel } from "./components/ExportBlockingPanel";
import { markerRegionCenter } from "./utils/markers";
import { buildApprovedFurnitureSpec, triggerJsonDownload } from "./utils/serialization";
import { slugifyFileName } from "./utils/filename";
import type { ValidationIssue } from "./utils/validation";
import type { Point, ProjectFile, Region } from "./types/project";

type Tab = "views" | "components" | "dimensions" | "spans" | "materials" | "validation";

const TABS: { id: Tab; label: string }[] = [
  { id: "views", label: "Views" },
  { id: "components", label: "Components" },
  { id: "dimensions", label: "Dimensions" },
  { id: "spans", label: "Spans" },
  { id: "materials", label: "Materials" },
  { id: "validation", label: "Validation" },
];

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
  }

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
          </div>
        </section>
      </main>
    </div>
  );
}
