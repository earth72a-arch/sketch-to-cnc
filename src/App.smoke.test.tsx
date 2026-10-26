import { describe, expect, it, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App } from "./App";
import { ProjectProvider } from "./state/ProjectContext";

/**
 * Mounts the real component tree in jsdom. This is NOT a substitute for
 * testing in an actual browser (let alone iPad Safari) — jsdom doesn't
 * implement setPointerCapture or real multi-touch, so gesture behavior
 * can't be exercised here. What this does catch: the app crashing on
 * mount after wiring changes (missing/renamed props, bad imports, marker
 * rendering blowing up, etc.) — a cheap, fast guard the gesture math unit
 * tests in viewerMath.test.ts and markers.test.ts don't cover.
 */
describe("App — mounts without throwing", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root!.unmount());
      root = null;
    }
    if (container) {
      container.remove();
      container = null;
    }
  });

  it("renders the header and the import panel on first load", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        <ProjectProvider>
          <App />
        </ProjectProvider>,
      );
    });

    expect(container.textContent).toContain("Sketch to CNC");
    expect(container.textContent).toContain("นำเข้าภาพสเก็ตช์");
    expect(container.textContent).toContain("ยังไม่มีภาพ");
  });

  it("switches to the Recognition tab without throwing (Session 2A regression)", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        <ProjectProvider>
          <App />
        </ProjectProvider>,
      );
    });

    const recognitionTabButton = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Recognition",
    );
    expect(recognitionTabButton).toBeTruthy();

    act(() => {
      recognitionTabButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Recognition Inspector");
    expect(container.textContent).toContain("นำเข้าภาพก่อนจึงจะใช้งาน Recognition Inspector ได้");
  });
});
