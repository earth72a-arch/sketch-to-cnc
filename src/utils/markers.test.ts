import { describe, expect, it } from "vitest";
import { findNearestMarker, markerRegionCenter, pointToMarkerRegion, MARKER_REGION_SIZE } from "./markers";
import { createApprovableSyntheticTestCase001 } from "../fixtures/testCase001.synthetic";
import { serializeDraftProject, parseProjectFile } from "./serialization";

describe("pointToMarkerRegion / markerRegionCenter — round trip", () => {
  it("recovers the original tapped point from its stored region", () => {
    const tapped = { x: 123.5, y: 77.25 };
    const region = pointToMarkerRegion(tapped);
    expect(region.width).toBe(MARKER_REGION_SIZE);
    expect(region.height).toBe(MARKER_REGION_SIZE);
    expect(markerRegionCenter(region)).toEqual(tapped);
  });
});

describe("findNearestMarker — dimension selection (tap-to-open)", () => {
  const markers = [
    { id: "a", point: { x: 0, y: 0 } },
    { id: "b", point: { x: 100, y: 100 } },
    { id: "c", point: { x: 105, y: 100 } },
  ];

  it("returns the closest marker within tolerance", () => {
    const hit = findNearestMarker(markers, { x: 103, y: 100 }, 20);
    expect(hit?.id).toBe("c");
  });

  it("returns null when nothing is within tolerance", () => {
    expect(findNearestMarker(markers, { x: 500, y: 500 }, 20)).toBeNull();
  });

  it("returns null for an empty marker list", () => {
    expect(findNearestMarker([], { x: 0, y: 0 }, 20)).toBeNull();
  });

  it("picks the nearest even when multiple markers are within tolerance", () => {
    const hit = findNearestMarker(markers, { x: 2, y: 2 }, 200);
    expect(hit?.id).toBe("a");
  });
});

describe("marker persistence through Project JSON save/restore", () => {
  it("keeps a dimension's annotation marker position exact across a round trip", () => {
    const project = createApprovableSyntheticTestCase001();
    const dim = project.dimensions.find((d) => d.id === "synthetic-dim-overall-width");
    expect(dim?.annotation).not.toBeNull();
    const originalCenter = markerRegionCenter(dim!.annotation!.region);

    const json = serializeDraftProject(project);
    const restored = parseProjectFile(json);
    expect(restored.ok).toBe(true);

    const restoredDim = restored.project!.dimensions.find(
      (d) => d.id === "synthetic-dim-overall-width",
    );
    expect(restoredDim?.annotation).not.toBeNull();
    const restoredCenter = markerRegionCenter(restoredDim!.annotation!.region);
    expect(restoredCenter).toEqual(originalCenter);
  });
});
