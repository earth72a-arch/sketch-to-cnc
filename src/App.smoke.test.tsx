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
      (b) => b.textContent === "Recognition / OCR (Experimental)",
    );
    expect(recognitionTabButton).toBeTruthy();

    act(() => {
      recognitionTabButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Recognition Inspector");
    expect(container.textContent).toContain("นำเข้าภาพก่อนจึงจะใช้งาน Recognition Inspector ได้");
  });

  it("renders the Dimension OCR panel under the Recognition tab without throwing (Session 2B)", () => {
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
      (b) => b.textContent === "Recognition / OCR (Experimental)",
    );
    act(() => {
      recognitionTabButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("Dimension OCR (Session 2B)");
    expect(container.textContent).toContain("นำเข้าภาพก่อนจึงจะใช้งาน OCR ได้");
  });

  it("Session 3A: defaults to the Tap-to-Dimension tab on first load, not OCR/Recognition", () => {
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

    expect(container.textContent).toContain("Tap-to-Dimension (V1)");
    // OCR's own panel text must NOT be visible until the user explicitly
    // navigates to the (now-Experimental) Recognition tab.
    expect(container.textContent).not.toContain("Dimension OCR (Session 2B)");

    const tapTabButton = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Tap-to-Dimension",
    );
    expect(tapTabButton?.className).toContain("app__tab--active");
  });

  it("Session 3A (M): mounting/using the app never starts OCR implicitly — diagnostics stay idle without the user opening Recognition", () => {
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

    // Switch across a few other tabs (as a user poking around would) —
    // none of this may touch the OCR engine.
    for (const label of ["Views", "Components", "Materials"]) {
      const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === label);
      act(() => btn!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    }

    expect(container.textContent).not.toContain("กำลังอ่าน OCR");
    expect(container.textContent).not.toContain("Dimension OCR (Session 2B)");
  });
});
