import { describe, expect, it } from "vitest";
import {
  computeFitTransform,
  distanceBetween,
  imagePointToScreen,
  midpoint,
  panByScreenDelta,
  screenToImagePoint,
  zoomToPoint,
} from "./viewerMath";

const RECT = { left: 0, top: 0, width: 800, height: 600 };

describe("computeFitTransform — image coordinate mapping", () => {
  it("centers and scales a landscape image to fit a landscape container", () => {
    const t = computeFitTransform(800, 600, 1600, 800);
    expect(t.scale).toBeCloseTo(0.5);
    expect(t.translateX).toBeCloseTo(0);
    expect(t.translateY).toBeCloseTo(100);
  });

  it("falls back to an identity transform for degenerate sizes", () => {
    expect(computeFitTransform(0, 600, 100, 100)).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });
});

describe("screenToImagePoint / imagePointToScreen — round trip", () => {
  it("round-trips a point through a non-trivial transform", () => {
    const transform = { scale: 2, translateX: 50, translateY: -30 };
    const original = { x: 123.4, y: 55.6 };
    const screen = imagePointToScreen(transform, RECT, original);
    const back = screenToImagePoint(transform, RECT, screen.x, screen.y);
    expect(back.x).toBeCloseTo(original.x);
    expect(back.y).toBeCloseTo(original.y);
  });

  it("a fresh identity transform maps screen 1:1 to image space", () => {
    const transform = { scale: 1, translateX: 0, translateY: 0 };
    const p = screenToImagePoint(transform, RECT, 42, 99);
    expect(p).toEqual({ x: 42, y: 99 });
  });
});

describe("zoomToPoint — zoom/pan transformation", () => {
  const transform = { scale: 1, translateX: 0, translateY: 0 };

  it("pure zoom (anchor === target) keeps the anchored image point stationary on screen", () => {
    const anchor = { x: 300, y: 200 };
    const before = screenToImagePoint(transform, RECT, anchor.x, anchor.y);
    const next = zoomToPoint(transform, RECT, anchor, anchor, 2, 0.05, 12);
    const after = screenToImagePoint(next, RECT, anchor.x, anchor.y);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.scale).toBe(2);
  });

  it("two-finger drag with NO scale change pans by exactly the midpoint delta (regression: used to cancel out to zero)", () => {
    const prevMid = { x: 300, y: 200 };
    const curMid = { x: 340, y: 250 }; // fingers moved together, same distance apart
    const next = zoomToPoint(transform, RECT, prevMid, curMid, transform.scale, 0.05, 12);
    expect(next.scale).toBe(transform.scale);
    expect(next.translateX).toBeCloseTo(transform.translateX + (curMid.x - prevMid.x));
    expect(next.translateY).toBeCloseTo(transform.translateY + (curMid.y - prevMid.y));
  });

  it("combined pinch+drag anchors the OLD midpoint's image content at the NEW midpoint", () => {
    const prevMid = { x: 300, y: 200 };
    const curMid = { x: 340, y: 250 };
    const imageUnderOldMid = screenToImagePoint(transform, RECT, prevMid.x, prevMid.y);
    const next = zoomToPoint(transform, RECT, prevMid, curMid, 3, 0.05, 12);
    const imageNowUnderNewMid = screenToImagePoint(next, RECT, curMid.x, curMid.y);
    expect(imageNowUnderNewMid.x).toBeCloseTo(imageUnderOldMid.x);
    expect(imageNowUnderNewMid.y).toBeCloseTo(imageUnderOldMid.y);
  });

  it("clamps scale to the provided min/max bounds", () => {
    const anchor = { x: 100, y: 100 };
    expect(zoomToPoint(transform, RECT, anchor, anchor, 999, 0.05, 12).scale).toBe(12);
    expect(zoomToPoint(transform, RECT, anchor, anchor, 0.0001, 0.05, 12).scale).toBe(0.05);
  });
});

describe("panByScreenDelta", () => {
  it("shifts translate without touching scale", () => {
    const next = panByScreenDelta({ scale: 3, translateX: 10, translateY: 10 }, 5, -4);
    expect(next).toEqual({ scale: 3, translateX: 15, translateY: 6 });
  });
});

describe("distanceBetween / midpoint", () => {
  it("computes Euclidean distance", () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("computes the midpoint of two points", () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
});
