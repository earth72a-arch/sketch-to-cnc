import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { DrawingView, Point, Region } from "../types/project";

const MIN_SCALE = 0.05;
const MAX_SCALE = 12;

export interface LoadedImage {
  url: string;
  width: number;
  height: number;
}

export type PlacementRequest =
  | { kind: "region"; onCapture: (region: Region) => void }
  | { kind: "point"; onCapture: (point: Point) => void };

interface Transform {
  scale: number;
  translateX: number;
  translateY: number;
}

function computeFitTransform(
  containerW: number,
  containerH: number,
  imgW: number,
  imgH: number,
): Transform {
  if (containerW <= 0 || containerH <= 0 || imgW <= 0 || imgH <= 0) {
    return { scale: 1, translateX: 0, translateY: 0 };
  }
  const scale = Math.min(containerW / imgW, containerH / imgH);
  return {
    scale,
    translateX: (containerW - imgW * scale) / 2,
    translateY: (containerH - imgH * scale) / 2,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface ImageViewerProps {
  image: LoadedImage | null;
  views: DrawingView[];
  activeViewId?: string | null;
  placement?: PlacementRequest | null;
  onCancelPlacement?: () => void;
}

export function ImageViewer({
  image,
  views,
  activeViewId,
  placement,
  onCancelPlacement,
}: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<Transform>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  const [dragPreview, setDragPreview] = useState<Region | null>(null);

  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const panStart = useRef<{ x: number; y: number } | null>(null);
  const pinchStart = useRef<{
    distance: number;
    scale: number;
  } | null>(null);
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
      const rect = container.getBoundingClientRect();
      const x = (clientX - rect.left - transform.translateX) / transform.scale;
      const y = (clientY - rect.top - transform.translateY) / transform.scale;
      return { x, y };
    },
    [transform],
  );

  const zoomAtScreenPoint = useCallback(
    (clientX: number, clientY: number, nextScaleRaw: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const nextScale = clamp(nextScaleRaw, MIN_SCALE, MAX_SCALE);
      setTransform((prev) => {
        const imageX = (clientX - rect.left - prev.translateX) / prev.scale;
        const imageY = (clientY - rect.top - prev.translateY) / prev.scale;
        return {
          scale: nextScale,
          translateX: clientX - rect.left - imageX * nextScale,
          translateY: clientY - rect.top - imageY * nextScale,
        };
      });
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

      if (placement && pointers.current.size === 1) {
        placementStart.current = screenToImage(e.clientX, e.clientY);
        if (placement.kind === "region") {
          setDragPreview({
            x: placementStart.current.x,
            y: placementStart.current.y,
            width: 0,
            height: 0,
          });
        }
        return;
      }

      if (pointers.current.size === 1) {
        panStart.current = { x: e.clientX, y: e.clientY };
      } else if (pointers.current.size === 2) {
        const pts = [...pointers.current.values()];
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        pinchStart.current = {
          distance: Math.hypot(dx, dy),
          scale: transform.scale,
        };
        panStart.current = null;
      }
    },
    [placement, screenToImage, transform.scale],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (placement && placementStart.current) {
        const current = screenToImage(e.clientX, e.clientY);
        if (placement.kind === "region") {
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

      if (pointers.current.size === 2) {
        const pts = [...pointers.current.values()];
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        const distance = Math.hypot(dx, dy);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        if (pinchStart.current && pinchStart.current.distance > 0) {
          const nextScale =
            pinchStart.current.scale * (distance / pinchStart.current.distance);
          zoomAtScreenPoint(midX, midY, nextScale);
        }
        return;
      }

      if (pointers.current.size === 1 && panStart.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        panStart.current = { x: e.clientX, y: e.clientY };
        setTransform((prev) => ({
          ...prev,
          translateX: prev.translateX + dx,
          translateY: prev.translateY + dy,
        }));
      }
    },
    [placement, screenToImage, zoomAtScreenPoint],
  );

  const finishPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      pointers.current.delete(e.pointerId);

      if (placement && placementStart.current) {
        if (placement.kind === "point") {
          placement.onCapture(screenToImage(e.clientX, e.clientY));
        } else if (placement.kind === "region" && dragPreview) {
          if (dragPreview.width > 2 && dragPreview.height > 2) {
            placement.onCapture(dragPreview);
          }
        }
        placementStart.current = null;
        setDragPreview(null);
        return;
      }

      if (pointers.current.size < 2) {
        pinchStart.current = null;
      }
      if (pointers.current.size === 0) {
        panStart.current = null;
      }
    },
    [placement, dragPreview, screenToImage],
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
              : "แทะหน้าจอ/คลิกเพื่อระบุจุดบนภาพ"}
            <button type="button" onClick={onCancelPlacement}>
              ยกเลิก
            </button>
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
        style={{ touchAction: "none" }}
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
            <svg
              className="image-viewer__overlay"
              width={image.width}
              height={image.height}
              viewBox={`0 0 ${image.width} ${image.height}`}
            >
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
              {dragPreview && (
                <rect
                  x={dragPreview.x}
                  y={dragPreview.y}
                  width={dragPreview.width}
                  height={dragPreview.height}
                  className="image-viewer__region image-viewer__region--drawing"
                />
              )}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
