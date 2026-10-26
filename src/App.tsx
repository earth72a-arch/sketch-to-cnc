import { useState } from "react";
import "./App.css";
import { useProject } from "./state/ProjectContext";
import { ImageViewer, type LoadedImage, type PlacementRequest } from "./components/ImageViewer";
import { ImportPanel, type ImportResult } from "./components/ImportPanel";
import { ViewManagerPanel } from "./components/ViewManagerPanel";
import { ComponentEditorPanel } from "./components/ComponentEditorPanel";
import { DimensionEditorPanel } from "./components/DimensionEditorPanel";
import { SpanEditorPanel } from "./components/SpanEditorPanel";
import { MaterialsPanel } from "./components/MaterialsPanel";
import { ValidationPanel } from "./components/ValidationPanel";
import { ProjectToolbar } from "./components/ProjectToolbar";
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

  return (
    <div className="app">
      <header className="app__header">
        <h1>Sketch to CNC</h1>
        <ProjectToolbar project={project} onRename={(name) => dispatch({ type: "RENAME_PROJECT", name })} onLoadProject={handleLoadProject} />
      </header>

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
                onRequestRegionPlacement={requestRegionPlacement}
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
