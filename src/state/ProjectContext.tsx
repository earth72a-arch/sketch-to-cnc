import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { createEmptyProject, type ProjectFile } from "../types/project";
import { projectReducer, type ProjectAction } from "./projectReducer";

interface ProjectContextValue {
  project: ProjectFile;
  dispatch: Dispatch<ProjectAction>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, dispatch] = useReducer(
    projectReducer,
    createEmptyProject("โปรเจกต์ใหม่"),
  );

  return (
    <ProjectContext.Provider value={{ project, dispatch }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return ctx;
}
