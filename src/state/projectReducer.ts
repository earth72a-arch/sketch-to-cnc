import {
  createEmptyProject,
  type Component,
  type Dimension,
  type DimensionSpan,
  type DrawingView,
  type Material,
  type ProjectFile,
  type ReviewStatus,
} from "../types/project";

export type ProjectAction =
  | {
      type: "IMPORT_IMAGE";
      fileName: string;
      width: number;
      height: number;
      sha256: string;
    }
  | { type: "RENAME_PROJECT"; name: string }
  | { type: "ADD_VIEW"; view: DrawingView }
  | { type: "UPDATE_VIEW"; id: string; patch: Partial<DrawingView> }
  | { type: "DELETE_VIEW"; id: string }
  | { type: "ADD_COMPONENT"; component: Component }
  | { type: "UPDATE_COMPONENT"; id: string; patch: Partial<Component> }
  | { type: "DELETE_COMPONENT"; id: string }
  | { type: "ADD_DIMENSION"; dimension: Dimension }
  | { type: "UPDATE_DIMENSION"; id: string; patch: Partial<Dimension> }
  | {
      type: "SET_DIMENSION_STATUS";
      id: string;
      status: ReviewStatus;
      note?: string;
    }
  | { type: "DELETE_DIMENSION"; id: string }
  | { type: "ADD_SPAN"; span: DimensionSpan }
  | { type: "UPDATE_SPAN"; id: string; patch: Partial<DimensionSpan> }
  | { type: "DELETE_SPAN"; id: string }
  | { type: "UPDATE_MATERIAL"; id: string; patch: Partial<Material> }
  | { type: "LOAD_PROJECT"; project: ProjectFile }
  | { type: "RESET_PROJECT"; projectName: string };

function touch(project: ProjectFile): ProjectFile {
  return { ...project, updatedAt: new Date().toISOString() };
}

export function projectReducer(
  project: ProjectFile,
  action: ProjectAction,
): ProjectFile {
  switch (action.type) {
    case "IMPORT_IMAGE":
      return touch({
        ...project,
        sourceImage: {
          fileName: action.fileName,
          width: action.width,
          height: action.height,
          sha256: action.sha256,
        },
      });

    case "RENAME_PROJECT":
      return touch({ ...project, projectName: action.name });

    case "ADD_VIEW":
      return touch({ ...project, views: [...project.views, action.view] });

    case "UPDATE_VIEW":
      return touch({
        ...project,
        views: project.views.map((v) =>
          v.id === action.id ? { ...v, ...action.patch } : v,
        ),
      });

    case "DELETE_VIEW":
      return touch({
        ...project,
        views: project.views.filter((v) => v.id !== action.id),
      });

    case "ADD_COMPONENT":
      return touch({
        ...project,
        components: [...project.components, action.component],
      });

    case "UPDATE_COMPONENT":
      return touch({
        ...project,
        components: project.components.map((c) =>
          c.id === action.id ? { ...c, ...action.patch } : c,
        ),
      });

    case "DELETE_COMPONENT":
      return touch({
        ...project,
        components: project.components.filter((c) => c.id !== action.id),
        // Orphaned references are left for validation to surface explicitly
        // rather than silently rewritten, except direct componentId links
        // which must not dangle on dimensions/spans.
        dimensions: project.dimensions.map((d) =>
          d.componentId === action.id ? { ...d, componentId: null } : d,
        ),
        spans: project.spans.map((s) =>
          s.componentId === action.id ? { ...s, componentId: null } : s,
        ),
      });

    case "ADD_DIMENSION":
      return touch({
        ...project,
        dimensions: [...project.dimensions, action.dimension],
      });

    case "UPDATE_DIMENSION":
      return touch({
        ...project,
        dimensions: project.dimensions.map((d) =>
          d.id === action.id ? { ...d, ...action.patch } : d,
        ),
      });

    case "SET_DIMENSION_STATUS":
      return touch({
        ...project,
        dimensions: project.dimensions.map((d) =>
          d.id === action.id
            ? {
                ...d,
                reviewStatus: action.status,
                note: action.note ?? d.note,
              }
            : d,
        ),
      });

    case "DELETE_DIMENSION":
      return touch({
        ...project,
        dimensions: project.dimensions.filter((d) => d.id !== action.id),
        spans: project.spans.map((s) =>
          s.dimensionId === action.id ? { ...s, dimensionId: null } : s,
        ),
      });

    case "ADD_SPAN":
      return touch({ ...project, spans: [...project.spans, action.span] });

    case "UPDATE_SPAN":
      return touch({
        ...project,
        spans: project.spans.map((s) =>
          s.id === action.id ? { ...s, ...action.patch } : s,
        ),
      });

    case "DELETE_SPAN":
      return touch({
        ...project,
        spans: project.spans
          .filter((s) => s.id !== action.id)
          .map((s) =>
            s.parentSpanId === action.id ? { ...s, parentSpanId: null } : s,
          ),
      });

    case "UPDATE_MATERIAL":
      return touch({
        ...project,
        materials: project.materials.map((m) =>
          m.id === action.id ? { ...m, ...action.patch } : m,
        ),
      });

    case "LOAD_PROJECT":
      return action.project;

    case "RESET_PROJECT":
      return createEmptyProject(action.projectName);

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
