import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { DrawingView, Point, Region } from "../types/project";
import { findNearestMarker } from "../utils/markers";
import {
  computeFitTransform,
  distanceBetween,
  midpoint,
  panByScreenDelta,
  screenToImagePoint,
  zoomToPoint,
  type ViewerTransform,
} from "../utils/viewerMath";

const MIN_SCALE = 0.05;
const MAX_SCALE = 12;

/** Screen-space movement a single pointer may drift before a "tap" turns
 * into a drag instead (so a slightly shaky tap still selects a marker). */
const TAP_MOVE_THRESHOLD_PX = 8;

/** Screen-space hit-test tolerance for tap-to-select-marker, converted to
 * image space via the current zoom level at hit-test time. */
const MARKER_TAP_TOLERANCE_SCREEN_PX = 24;

export interface LoadedImage {
  url: string;
  width: number;
  height: number;
}

export interface ViewerMarker {
  id: string;
  point: Point;
  label: string;
  /** Session 3A — Draft vs Confirmed visual distinction (CLAUDE.md §6: a
   * draft must never look indistinguishable from a confirmed value).
   * Omitted entirely for markers with no such distinction (e.g. existing
   * OCR-adjacent flows that don't pass this). */
  status?: "draft" | "confirmed";
}

export type PlacementRequest =
  | { kind: "region"; onCapture: (region: Region) => void }
  | { kind: "point"; onCapture: (point: Point) => void };

/** A color-classification mask rendered as a semi-transparent overlay.
 * Purely additive/optional — omitting this prop renders exactly as before
 * Session 2A (Views/Components/Dimensions/Spans tabs never pass it). */
export interface MaskLayer {
  id: string;
  mask: Uint8Array;
  color: { r: number; g: number; b: number };
  opacity?: number;
}

/** A detected-line overlay segment, in original-image pixel coordinates. */
export interface LineOverlaySegment {
  id: string;
  start: Point;
  end: Point;
  colorHex: string;
}

/** A highlighted rectangular region (Session 2B OCR text-region / OCR
 * candidate overlay), in original-image pixel coordinates. Purely
 * additive/optional, same posture as MaskLayer/LineOverlaySegment —
 * omitting this prop renders exactly as every earlier session. */
export interface RegionOverlayItem {
  id: string;
  region: Region;
  colorHex: string;
  label?: string;
  selected?: boolean;
  onSelect?: () => void;
}

function MaskCanvasLayer({
  mask,
  width,
  height,
  color,
  opacity = 0.45,
}: {
  mask: Uint8Array;
  width: number;
  height: number;
  color: { r: number; g: number; b: number };
  opacity?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.createImageData(width, height);
    const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const o = i * 4;
      imageData.data[o] = color.r;
      imageData.data[o + 1] = color.g;
      imageData.data[o + 2] = color.b;
      imageData.data[o + 3] = alpha;
    }
    ctx.putImageData(imageData, 0, 0);
  }, [mask, width, height, color, opacity]);

  return <canvas ref={canvasRef} width={width} height={height} className="image-viewer__mask-canvas" />;
}

interface SinglePointerState {
  startClient: Point;
  lastClient: Point;
  moved: boolean;
}

interface TwoPointerState {
  prevMid: Point;
  prevDistance: number;
}

interface ImageViewerProps {
  image: LoadedImage | null;
  views: DrawingView[];
  activeViewId?: string | null;
  placement?: PlacementRequest | null;
  onCancelPlacement?: () => void;
  markers?: ViewerMarker[];
  onSelectMarker?: (id: string) => void;
  maskLayers?: MaskLayer[];
  lineOverlay?: LineOverlaySegment[];
  regionOverlay?: RegionOverlayItem[];
}

export function ImageViewer({
  image,
  views,
  activeViewId,
  placement,
  onCancelPlacement,
  markers = [],
  onSelectMarker,
  maskLayers = [],
  lineOverlay = [],
  regionOverlay = [],
}: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<ViewerTransform>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  const [dragPreview, setDragPreview] = useState<Region | null>(null);
  const [panModeEnabled, setPanModeEnabled] = useState(false);

  const pointers = useRef<Map<number, Point>>(new Map());
  const singlePointer = useRef<SinglePointerState | null>(null);
  const twoPointer = useRef<TwoPointerState | null>(null);
  const placementStart = useRef<Point | null>(null);

  const resetView = useCallback(() => {
    const container = containerRef.current;
    if (!container || !image) return;
    const rect = container.getBoundingClientRect();
    setTransform(
      computeFitTransform(rect.width, rect.height, image.width, image.height),
    );
  }, [image]);

  const onImgLoad = useCallback(() => {
    resetView();
  }, [resetView]);

  const screenToImage = useCallback(
    (clientX: number, clientY: number): Point => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      return screenToImagePoint(
        transform,
        container.getBoundingClientRect(),
        clientX,
        clientY,
      );
    },
    [transform],
  );

  const zoomAtScreenPoint = useCallback(
    (clientX: number, clientY: number, nextScaleRaw: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const point = { x: clientX, y: clientY };
      setTransform((prev) =>
        zoomToPoint(prev, rect, point, point, nextScaleRaw, MIN_SCALE, MAX_SCALE),
      );
    },
    [],
  );

  const zoomByFactor = useCallback(
    (factor: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      zoomAtScreenPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        transform.scale * factor,
      );
    },
    [transform.scale, zoomAtScreenPoint],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAtScreenPoint(e.clientX, e.clientY, transform.scale * factor);
    },
    [transform.scale, zoomAtScreenPoint],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const count = pointers.current.size;

      if (placement) {
        if (count === 1) {
          placementStart.current = screenToImage(e.clientX, e.clientY);
          if (placement.kind === "region") {
            setDragPreview({
              x: placementStart.current.x,
              y: placementStart.current.y,
              width: 0,
              height: 0,
            });
          }
        }
        return;
      }

      if (count === 2) {
        singlePointer.current = null;
        const pts = [...pointers.current.values()];
        twoPointer.current = {
          prevMid: midpoint(pts[0], pts[1]),
          prevDistance: distanceBetween(pts[0], pts[1]),
        };
        return;
      }

      if (count === 1) {
        twoPointer.current = null;
        singlePointer.current = {
          startClient: { x: e.clientX, y: e.clientY },
          lastClient: { x: e.clientX, y: e.clientY },
          moved: false,
        };
      }
      // 3+ simultaneous pointers: intentionally ignored (not needed, see spec).
    },
    [placement, screenToImage],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const count = pointers.current.size;

      if (placement) {
        if (placementStart.current && placement.kind === "region") {
          e.preventDefault();
          const current = screenToImage(e.clientX, e.clientY);
          const start = placementStart.current;
          setDragPreview({
            x: Math.min(start.x, current.x),
            y: Math.min(start.y, current.y),
            width: Math.abs(current.x - start.x),
            height: Math.abs(current.y - start.y),
          });
        }
        return;
      }

      if (count === 2 && twoPointer.current) {
        e.preventDefault();
        const pts = [...pointers.current.values()];
        const curMid = midpoint(pts[0], pts[1]);
        const curDist = distanceBetween(pts[0], pts[1]);
        const prev = twoPointer.current;
        const scaleRatio = prev.prevDistance > 0 ? curDist / prev.prevDistance : 1;

        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          setTransform((t) =>
            zoomToPoint(
              t,
              rect,
              prev.prevMid,
              curMid,
              t.scale * scaleRatio,
              MIN_SCALE,
              MAX_SCALE,
            ),
          );
        }
        twoPointer.current = { prevMid: curMid, prevDistance: curDist };
        return;
      }

      if (count === 1 && singlePointer.current) {
        const sp = singlePointer.current;
        const current = { x: e.clientX, y: e.clientY };
        if (distanceBetween(sp.startClient, current) > TAP_MOVE_THRESHOLD_PX) {
          sp.moved = true;
        }
        if (panModeEnabled) {
          e.preventDefault();
          const dx = current.x - sp.lastClient.x;
          const dy = current.y - sp.lastClient.y;
          setTransform((t) => panByScreenDelta(t, dx, dy));
        }
        sp.lastClient = current;
      }
    },
    [placement, panModeEnabled, screenToImage],
  );

  const finishPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      pointers.current.delete(e.pointerId);

      if (placement) {
        if (placementStart.current) {
          if (placement.kind === "point") {
            placement.onCapture(screenToImage(e.clientX, e.clientY));
          } else if (placement.kind === "region" && dragPreview) {
            if (dragPreview.width > 2 && dragPreview.height > 2) {
              placement.onCapture(dragPreview);
            }
          }
          placementStart.current = null;
          setDragPreview(null);
        }
        return;
      }

      const sp = singlePointer.current;
      if (sp && !panModeEnabled && !sp.moved && markers.length > 0 && onSelectMarker) {
        const tapPoint = screenToImage(e.clientX, e.clientY);
        const toleranceImagePx = MARKER_TAP_TOLERANCE_SCREEN_PX / transform.scale;
        const hit = findNearestMarker(markers, tapPoint, toleranceImagePx);
        if (hit) onSelectMarker(hit.id);
      }

      if (pointers.current.size < 2) {
        twoPointer.current = null;
      }
      if (pointers.current.size === 0) {
        singlePointer.current = null;
      }
    },
    [placement, dragPreview, screenToImage, panModeEnabled, markers, onSelectMarker, transform.scale],
  );

  return (
    <div className="image-viewer">
      <div className="image-viewer__toolbar">
        <button type="button" onClick={() => zoomByFactor(1.25)} aria-label="ซูมเข้า">
          ซูม +
        </button>
        <button type="button" onClick={() => zoomByFactor(1 / 1.25)} aria-label="ซูมออก">
          ซูม −
        </button>
        <button type="button" onClick={resetView} aria-label="รีเซ็ตมุมมอง">
          รีเซ็ตมุมมอง
        </button>
        <button
          type="button"
          aria-pressed={panModeEnabled}
          className={
            panModeEnabled
              ? "image-viewer__toolbar-btn image-viewer__toolbar-btn--active"
              : "image-viewer__toolbar-btn"
          }
          onClick={() => setPanModeEnabled((v) => !v)}
        >
          {panModeEnabled ? "โหมดลากภาพ: เปิด" : "โหมดลากภาพ"}
        </button>
        {image && (
          <span className="image-viewer__dimensions">
            ขนาดภาพต้นฉบับ: {image.width} × {image.height} px · ซูม{" "}
            {(transform.scale * 100).toFixed(0)}%
          </span>
        )}
        {placement && (
          <span className="image-viewer__placement-hint">
            {placement.kind === "region"
              ? "ลากเพื่อกำหนดพื้นที่บนภาพ"
              : "แตะตำแหน่งบนภาพเพื่อระบุจุด"}
            <button type="button" onClick={onCancelPlacement}>
              ยกเลิก
            </button>
          </span>
        )}
        {!placement && (
          <span className="image-viewer__placement-hint">
            {panModeEnabled
              ? "หนึ่งนิ้ว/Apple Pencil ลากเพื่อเลื่อนภาพ"
              : "สองนิ้วลาก = เลื่อนภาพ · สองนิ้วถ่าง/หุบ = ซูม · แตะ 1 นิ้ว = เลือกจุดอ้างอิง"}
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        className="image-viewer__stage-container"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        style={{
          touchAction: "none",
          overscrollBehavior: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        {!image && (
          <div className="image-viewer__empty">ยังไม่มีภาพ — นำเข้าภาพ PNG เพื่อเริ่มต้น</div>
        )}
        {image && (
          <div
            className="image-viewer__stage"
            style={{
              width: image.width,
              height: image.height,
              transform: `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scale})`,
            }}
          >
            <img
              src={image.url}
              width={image.width}
              height={image.height}
              alt="ภาพสเก็ตช์ที่นำเข้า"
              onLoad={onImgLoad}
              draggable={false}
            />
            {maskLayers.map((layer) => (
              <MaskCanvasLayer
                key={layer.id}
                mask={layer.mask}
                width={image.width}
                height={image.height}
                color={layer.color}
                opacity={layer.opacity}
              />
            ))}
            <svg
              className="image-viewer__overlay"
              width={image.width}
              height={image.height}
              viewBox={`0 0 ${image.width} ${image.height}`}
            >
              {lineOverlay.map((line) => (
                <line
                  key={line.id}
                  x1={line.start.x}
                  y1={line.start.y}
                  x2={line.end.x}
                  y2={line.end.y}
                  stroke={line.colorHex}
                  strokeWidth={2}
                  className="image-viewer__detected-line"
                />
              ))}
              {views.map((view) => (
                <rect
                  key={view.id}
                  x={view.region.x}
                  y={view.region.y}
                  width={view.region.width}
                  height={view.region.height}
                  className={
                    view.id === activeViewId
                      ? "image-viewer__region image-viewer__region--active"
                      : "image-viewer__region"
                  }
                />
              ))}
              {regionOverlay.map((item) => (
                <g key={item.id}>
                  <rect
                    x={item.region.x}
                    y={item.region.y}
                    width={item.region.width}
                    height={item.region.height}
                    fill="none"
                    stroke={item.colorHex}
                    strokeWidth={item.selected ? 3 : 1.5}
                    className="image-viewer__ocr-region"
                    onClick={item.onSelect}
                    style={{ cursor: item.onSelect ? "pointer" : undefined, pointerEvents: item.onSelect ? "all" : "none" }}
                  />
                  {item.label && (
                    <text
                      x={item.region.x}
                      y={item.region.y - 4}
                      fill={item.colorHex}
                      className="image-viewer__ocr-region-label"
                    >
                      {item.label}
                    </text>
                  )}
                </g>
              ))}
              {dragPreview && (
                <rect
                  x={dragPreview.x}
                  y={dragPreview.y}
                  width={dragPreview.width}
                  height={dragPreview.height}
                  className="image-viewer__region image-viewer__region--drawing"
                />
              )}
              {markers.map((marker) => (
                <g key={marker.id} transform={`translate(${marker.point.x}, ${marker.point.y})`}>
                  <circle
                    r={13}
                    className={
                      marker.status
                        ? `image-viewer__marker-dot image-viewer__marker-dot--${marker.status}`
                        : "image-viewer__marker-dot"
                    }
                  />
                  <text y={4} textAnchor="middle" className="image-viewer__marker-label">
                    {marker.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
