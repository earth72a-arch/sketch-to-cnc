import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { TapToDimensionPanel } from "./TapToDimensionPanel";
import type { Component, Dimension, Point } from "../types/project";

const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLSelectElement.prototype,
  "value",
)!.set!;

function setSelectValue(select: HTMLSelectElement, value: string) {
  nativeSelectValueSetter.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function makeComponent(overrides: Partial<Component> = {}): Component {
  return {
    id: "comp-1",
    name: "Main Cabinet",
    type: "cabinet",
    parentComponentId: null,
    viewIds: [],
    materialId: null,
    requiresMaterial: false,
    reviewStatus: "confirmed",
    ...overrides,
  };
}

/**
 * Session 3A — component-level acceptance tests for the Tap-to-Dimension
 * workflow (A-I of the Session 3A brief). Follows the same raw
 * react-dom/client + act() pattern as App.smoke.test.tsx (this project
 * has no @testing-library dependency — CLAUDE.md §7 prefers lightweight
 * dependencies, so this reuses the existing pattern instead of adding
 * one). `onRequestPointPlacement` here is a test double that invokes its
 * callback immediately with a fixed point, standing in for "the user
 * tapped the image" (real pointer-gesture capture is ImageViewer's job,
 * already covered by its own tests — this suite is about what happens
 * to the CAPTURED point/value, not the gesture itself).
 */

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)!.set!;

function setInputValue(input: HTMLInputElement, value: string) {
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function clickButtonByText(container: HTMLElement, text: string) {
  const btn = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  if (!btn) throw new Error(`Button not found: ${text}`);
  btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function clickButtonContaining(container: HTMLElement, text: string) {
  const btn = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  if (!btn) throw new Error(`Button not found containing: ${text}`);
  btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

const FIXED_POINT: Point = { x: 123, y: 456 };

describe("TapToDimensionPanel — Session 3A acceptance tests", () => {
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

  function renderPanel(overrides: Partial<Parameters<typeof TapToDimensionPanel>[0]> = {}) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const onAddDimension = vi.fn();
    const onUpdateDimension = vi.fn();
    const onDeleteDimension = vi.fn();
    const onSetStatus = vi.fn();
    const onRequestPointPlacement = vi.fn((onCapture: (p: Point) => void) => onCapture(FIXED_POINT));
    const onCancelPlacement = vi.fn();

    act(() => {
      root!.render(
        <TapToDimensionPanel
          dimensions={[]}
          components={[]}
          isoAxisCentroidsDeg={null}
          onAddDimension={onAddDimension}
          onUpdateDimension={onUpdateDimension}
          onDeleteDimension={onDeleteDimension}
          onSetStatus={onSetStatus}
          onRequestPointPlacement={onRequestPointPlacement}
          onCancelPlacement={onCancelPlacement}
          imageLoaded={true}
          {...overrides}
        />,
      );
    });

    return { onAddDimension, onUpdateDimension, onDeleteDimension, onSetStatus, onRequestPointPlacement, onCancelPlacement };
  }

  it("(A) tapping the image (via placement capture) opens the Numeric Input popup", () => {
    renderPanel();
    act(() => clickButtonByText(container!, "เปิดโหมด Tap-to-Dimension"));
    const input = container!.querySelector('input[type="number"]');
    expect(input).toBeTruthy();
  });

  it.each([
    ["35", 35],
    ["60", 60],
    ["30", 30],
    ["8", 8],
  ])("(B-E) entering %s and saving produces value %d", (text, expected) => {
    const { onAddDimension } = renderPanel();
    act(() => clickButtonByText(container!, "เปิดโหมด Tap-to-Dimension"));
    const input = container!.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => setInputValue(input, text));
    act(() => clickButtonContaining(container!, "บันทึก"));

    expect(onAddDimension).toHaveBeenCalledTimes(1);
    const dim: Dimension = onAddDimension.mock.calls[0][0];
    expect(dim.value).toBe(expected);
    expect(dim.unit).toBe("mm");
    expect(dim.annotation).toEqual({ viewId: null, region: { x: FIXED_POINT.x - 12, y: FIXED_POINT.y - 12, width: 24, height: 24 } });
    expect(dim.reviewStatus).toBe("read");
    expect(dim.provenance.source).toBe("tap_to_dimension");
  });

  it("(F) supports a decimal value", () => {
    const { onAddDimension } = renderPanel();
    act(() => clickButtonByText(container!, "เปิดโหมด Tap-to-Dimension"));
    const input = container!.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => setInputValue(input, "45.5"));
    act(() => clickButtonContaining(container!, "บันทึก"));

    expect(onAddDimension).toHaveBeenCalledTimes(1);
    expect(onAddDimension.mock.calls[0][0].value).toBe(45.5);
  });

  it("(G) Cancel does not create a dimension record", () => {
    const { onAddDimension } = renderPanel();
    act(() => clickButtonByText(container!, "เปิดโหมด Tap-to-Dimension"));
    const input = container!.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => setInputValue(input, "99"));
    act(() => clickButtonByText(container!, "ยกเลิก"));

    expect(onAddDimension).not.toHaveBeenCalled();
  });

  it("rejects non-numeric / invalid values (Save stays disabled)", () => {
    renderPanel();
    act(() => clickButtonByText(container!, "เปิดโหมด Tap-to-Dimension"));
    const input = container!.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => setInputValue(input, "abc"));
    const saveBtn = [...container!.querySelectorAll("button")].find((b) => b.textContent?.includes("บันทึก")) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    act(() => setInputValue(input, "-5"));
    expect(saveBtn.disabled).toBe(true);

    act(() => setInputValue(input, "0"));
    expect(saveBtn.disabled).toBe(true);
  });

  it("(H) editing an existing marker's value updates it (position unchanged)", () => {
    const existing: Dimension = {
      id: "dim-existing",
      value: 35,
      unit: "mm",
      normalizedValueMm: 35,
      componentId: null,
      elementId: null,
      axis: "unassigned",
      axisSource: "user_selected",
      geometricReference: null,
      property: "custom",
      customPropertyLabel: "รอระบุประเภท (Tap-to-Dimension)",
      annotation: { viewId: null, region: { x: 100, y: 100, width: 24, height: 24 } },
      reviewStatus: "read",
      provenance: { source: "tap_to_dimension", timestamp: "2026-01-01T00:00:00.000Z" },
    };
    const { onUpdateDimension } = renderPanel({ dimensions: [existing] });

    act(() => clickButtonContaining(container!, "35 mm"));
    const input = container!.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input.value).toBe("35");
    act(() => setInputValue(input, "42"));
    act(() => clickButtonContaining(container!, "บันทึก"));

    expect(onUpdateDimension).toHaveBeenCalledWith("dim-existing", expect.objectContaining({ value: 42, unit: "mm" }));
  });

  it("(I) deleting a marker calls onDeleteDimension with its id", () => {
    const existing: Dimension = {
      id: "dim-to-delete",
      value: 60,
      unit: "mm",
      normalizedValueMm: 60,
      componentId: null,
      elementId: null,
      axis: "unassigned",
      axisSource: "user_selected",
      geometricReference: null,
      property: "custom",
      customPropertyLabel: "รอระบุประเภท (Tap-to-Dimension)",
      annotation: { viewId: null, region: { x: 50, y: 50, width: 24, height: 24 } },
      reviewStatus: "read",
      provenance: { source: "tap_to_dimension", timestamp: "2026-01-01T00:00:00.000Z" },
    };
    const { onDeleteDimension } = renderPanel({ dimensions: [existing] });

    act(() => clickButtonByText(container!, "ลบ"));
    expect(onDeleteDimension).toHaveBeenCalledWith("dim-to-delete");
  });

  it("shows Draft vs Confirmed status distinctly and lets a Draft be confirmed", () => {
    const draft: Dimension = {
      id: "dim-draft",
      value: 30,
      unit: "mm",
      normalizedValueMm: 30,
      componentId: null,
      elementId: null,
      axis: "unassigned",
      axisSource: "user_selected",
      geometricReference: null,
      property: "custom",
      customPropertyLabel: "รอระบุประเภท (Tap-to-Dimension)",
      annotation: { viewId: null, region: { x: 20, y: 20, width: 24, height: 24 } },
      reviewStatus: "read",
      provenance: { source: "tap_to_dimension", timestamp: "2026-01-01T00:00:00.000Z" },
    };
    const { onSetStatus } = renderPanel({ dimensions: [draft] });

    expect(container!.textContent).toContain("Draft");
    act(() => clickButtonByText(container!, "ยืนยัน"));
    expect(onSetStatus).toHaveBeenCalledWith("dim-draft", "confirmed");
  });

  it("does not open the mode/placement machinery when no image is loaded", () => {
    const { onRequestPointPlacement } = renderPanel({ imageLoaded: false });
    const modeBtn = [...container!.querySelectorAll("button")].find((b) => b.textContent?.includes("Tap-to-Dimension")) as HTMLButtonElement;
    expect(modeBtn.disabled).toBe(true);
    expect(onRequestPointPlacement).not.toHaveBeenCalled();
  });
});

describe("TapToDimensionPanel — Session 3B Geometry-Referenced Dimensions", () => {
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

  function renderPanel(overrides: Partial<Parameters<typeof TapToDimensionPanel>[0]> = {}) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const onAddDimension = vi.fn();
    const onUpdateDimension = vi.fn();
    const onDeleteDimension = vi.fn();
    const onSetStatus = vi.fn();
    const onRequestPointPlacement = vi.fn((onCapture: (p: Point) => void) => onCapture(FIXED_POINT));
    const onCancelPlacement = vi.fn();

    act(() => {
      root!.render(
        <TapToDimensionPanel
          dimensions={[]}
          components={[]}
          isoAxisCentroidsDeg={null}
          onAddDimension={onAddDimension}
          onUpdateDimension={onUpdateDimension}
          onDeleteDimension={onDeleteDimension}
          onSetStatus={onSetStatus}
          onRequestPointPlacement={onRequestPointPlacement}
          onCancelPlacement={onCancelPlacement}
          imageLoaded={true}
          {...overrides}
        />,
      );
    });

    return { onAddDimension, onUpdateDimension, onDeleteDimension, onSetStatus, onRequestPointPlacement, onCancelPlacement };
  }

  it("Axis and Component are both optional — a Draft can be saved with neither set", () => {
    const { onAddDimension } = renderPanel({ components: [makeComponent()] });
    act(() => clickButtonByText(container!, "เปิดโหมด Tap-to-Dimension"));
    const input = container!.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => setInputValue(input, "35"));
    act(() => clickButtonContaining(container!, "บันทึก"));

    const dim: Dimension = onAddDimension.mock.calls[0][0];
    expect(dim.axis).toBe("unassigned");
    expect(dim.componentId).toBeNull();
    expect(dim.reviewStatus).toBe("read"); // Draft — never auto-confirmed
  });

  it("saving with an Axis selected but no Component produces an Axis-only Draft", () => {
    const { onAddDimension } = renderPanel({ components: [makeComponent()] });
    act(() => clickButtonByText(container!, "เปิดโหมด Tap-to-Dimension"));
    const selects = [...container!.querySelectorAll("select")];
    const axisSelectEl = selects.find((s) => [...s.options].some((o) => o.text.includes("ISO Axis A"))) as HTMLSelectElement;
    act(() => setSelectValue(axisSelectEl, "iso_axis_a"));
    const input = container!.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => setInputValue(input, "35"));
    act(() => clickButtonContaining(container!, "บันทึก"));

    const dim: Dimension = onAddDimension.mock.calls[0][0];
    expect(dim.axis).toBe("iso_axis_a");
    expect(dim.componentId).toBeNull();
  });

  it("saving with a Component selected but no Axis produces a Component-only Draft", () => {
    const comp = makeComponent({ id: "comp-xyz", name: "Shelf" });
    const { onAddDimension } = renderPanel({ components: [comp] });
    act(() => clickButtonByText(container!, "เปิดโหมด Tap-to-Dimension"));
    const selects = [...container!.querySelectorAll("select")];
    const componentSelectEl = selects.find((s) => [...s.options].some((o) => o.value === "comp-xyz")) as HTMLSelectElement;
    act(() => setSelectValue(componentSelectEl, "comp-xyz"));
    const input = container!.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => setInputValue(input, "35"));
    act(() => clickButtonContaining(container!, "บันทึก"));

    const dim: Dimension = onAddDimension.mock.calls[0][0];
    expect(dim.axis).toBe("unassigned");
    expect(dim.componentId).toBe("comp-xyz");
  });

  it("multiple Dimensions can be saved on the same Axis and same Component without being merged/blocked", () => {
    const comp = makeComponent({ id: "comp-shared" });
    const { onAddDimension } = renderPanel({ components: [comp] });
    act(() => clickButtonByText(container!, "เปิดโหมด Tap-to-Dimension")); // mode stays active and re-arms after each save

    for (const v of ["10", "20"]) {
      const selects = [...container!.querySelectorAll("select")];
      const axisSelectEl = selects.find((s) => [...s.options].some((o) => o.text.includes("ISO Axis A"))) as HTMLSelectElement;
      act(() => setSelectValue(axisSelectEl, "iso_axis_a"));
      const componentSelectEl = selects.find((s) => [...s.options].some((o) => o.value === "comp-shared")) as HTMLSelectElement;
      act(() => setSelectValue(componentSelectEl, "comp-shared"));
      const input = container!.querySelector('input[type="number"]') as HTMLInputElement;
      act(() => setInputValue(input, v));
      act(() => clickButtonContaining(container!, "บันทึก"));
    }

    expect(onAddDimension).toHaveBeenCalledTimes(2);
    const [d1, d2] = onAddDimension.mock.calls.map((c) => c[0] as Dimension);
    expect(d1.axis).toBe("iso_axis_a");
    expect(d2.axis).toBe("iso_axis_a");
    expect(d1.componentId).toBe("comp-shared");
    expect(d2.componentId).toBe("comp-shared");
    expect(d1.id).not.toBe(d2.id);
  });

  it("changing the Axis of an existing Dimension later updates only that field", () => {
    const existing: Dimension = {
      id: "dim-change-axis",
      value: 35,
      unit: "mm",
      normalizedValueMm: 35,
      componentId: "comp-1",
      elementId: null,
      axis: "unassigned",
      axisSource: "user_selected",
      geometricReference: null,
      property: "custom",
      customPropertyLabel: "test",
      annotation: { viewId: null, region: { x: 10, y: 10, width: 24, height: 24 } },
      reviewStatus: "read",
      provenance: { source: "tap_to_dimension", timestamp: "2026-01-01T00:00:00.000Z" },
    };
    const { onUpdateDimension } = renderPanel({ dimensions: [existing], components: [makeComponent()] });

    act(() => clickButtonContaining(container!, "35 mm"));
    const selects = [...container!.querySelectorAll("select")];
    const axisSelectEl = selects.find((s) => [...s.options].some((o) => o.text.includes("ISO Axis B"))) as HTMLSelectElement;
    act(() => setSelectValue(axisSelectEl, "iso_axis_b"));
    act(() => clickButtonContaining(container!, "บันทึก"));

    expect(onUpdateDimension).toHaveBeenCalledWith(
      "dim-change-axis",
      expect.objectContaining({ axis: "iso_axis_b", axisSource: "user_selected" }),
    );
  });

  it("changing the Component of an existing Dimension later updates only that field", () => {
    const existing: Dimension = {
      id: "dim-change-component",
      value: 60,
      unit: "mm",
      normalizedValueMm: 60,
      componentId: null,
      elementId: null,
      axis: "vertical_axis",
      axisSource: "user_selected",
      geometricReference: null,
      property: "custom",
      customPropertyLabel: "test",
      annotation: { viewId: null, region: { x: 10, y: 10, width: 24, height: 24 } },
      reviewStatus: "read",
      provenance: { source: "tap_to_dimension", timestamp: "2026-01-01T00:00:00.000Z" },
    };
    const comp = makeComponent({ id: "comp-new", name: "Door" });
    const { onUpdateDimension } = renderPanel({ dimensions: [existing], components: [comp] });

    act(() => clickButtonContaining(container!, "60 mm"));
    const selects = [...container!.querySelectorAll("select")];
    const componentSelectEl = selects.find((s) => [...s.options].some((o) => o.value === "comp-new")) as HTMLSelectElement;
    act(() => setSelectValue(componentSelectEl, "comp-new"));
    act(() => clickButtonContaining(container!, "บันทึก"));

    expect(onUpdateDimension).toHaveBeenCalledWith("dim-change-component", expect.objectContaining({ componentId: "comp-new" }));
  });

  it("never guesses a Component from the tap position alone — componentId stays null unless explicitly chosen", () => {
    const { onAddDimension } = renderPanel({ components: [makeComponent({ id: "comp-near-tap" })] });
    act(() => clickButtonByText(container!, "เปิดโหมด Tap-to-Dimension")); // FIXED_POINT tap, component available but NOT selected
    const input = container!.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => setInputValue(input, "35"));
    act(() => clickButtonContaining(container!, "บันทึก"));

    expect(onAddDimension.mock.calls[0][0].componentId).toBeNull();
  });

  it("accepting a suggested axis writes it with axisSource user_selected (never silently left as a system suggestion)", () => {
    const { onAddDimension } = renderPanel({ isoAxisCentroidsDeg: [29.6, 90.8, 151.9] });
    act(() => clickButtonByText(container!, "เปิดโหมด Tap-to-Dimension"));
    act(() => clickButtonContaining(container!, "ISO Axis A"));
    const input = container!.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => setInputValue(input, "35"));
    act(() => clickButtonContaining(container!, "บันทึก"));

    const dim: Dimension = onAddDimension.mock.calls[0][0];
    expect(dim.axis).toBe("iso_axis_a");
    expect(dim.axisSource).toBe("user_selected");
  });
});
