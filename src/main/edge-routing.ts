import type { DiagramNode } from "../core";

export type Point = {
  x: number;
  y: number;
};

export type NodeBox = {
  id: string;
  shape: DiagramNode["shape"];
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EdgeSide = "left" | "right" | "top" | "bottom";

type PathSideOverrides = {
  startSide?: EdgeSide;
  endSide?: EdgeSide;
};

const defaultStubLength = 20;

export function buildOrthogonalPath(
  from: NodeBox,
  to: NodeBox,
  routeHints: Point[],
  sideOverrides: PathSideOverrides = {},
): Point[] {
  const fromCenter = getCenter(from);
  const toCenter = getCenter(to);
  const startHint = routeHints[0] ?? toCenter;
  const endHint = routeHints[routeHints.length - 1] ?? fromCenter;
  const startSide = sideOverrides.startSide ?? chooseSide(fromCenter, startHint);
  const endSide = sideOverrides.endSide ?? chooseSide(toCenter, endHint);
  const start = getBoundaryPointForSide(from, startSide);
  const end = getBoundaryPointForSide(to, endSide);
  const startStub = offsetPoint(start, startSide, defaultStubLength);
  const endStub = offsetPoint(end, endSide, defaultStubLength);

  return normalizePathPoints([
    start,
    startStub,
    ...connectOrthogonally(startStub, endStub, startSide, endSide, routeHints),
    endStub,
    end,
  ]);
}

export function isOrthogonalPath(points: Point[]): boolean {
  return points.every((point, index) => {
    const previous = points[index - 1];

    if (!previous) {
      return true;
    }

    return previous.x === point.x || previous.y === point.y;
  });
}

function connectOrthogonally(
  start: Point,
  end: Point,
  startSide: EdgeSide,
  endSide: EdgeSide,
  routeHints: Point[],
): Point[] {
  if (start.x === end.x || start.y === end.y) {
    return [end];
  }

  if (isHorizontal(startSide) && isHorizontal(endSide)) {
    const viaX = chooseCorridorValue("x", start, end, routeHints);
    return [{ x: viaX, y: start.y }, { x: viaX, y: end.y }, end];
  }

  if (!isHorizontal(startSide) && !isHorizontal(endSide)) {
    const viaY = chooseCorridorValue("y", start, end, routeHints);
    return [{ x: start.x, y: viaY }, { x: end.x, y: viaY }, end];
  }

  if (isHorizontal(startSide)) {
    return [{ x: end.x, y: start.y }, end];
  }

  return [{ x: start.x, y: end.y }, end];
}

function chooseCorridorValue(
  axis: "x" | "y",
  start: Point,
  end: Point,
  routeHints: Point[],
): number {
  if (routeHints.length > 0) {
    return round(routeHints[Math.floor(routeHints.length / 2)][axis]);
  }

  return round((start[axis] + end[axis]) / 2);
}

function chooseSide(center: Point, target: Point): EdgeSide {
  const dx = target.x - center.x;
  const dy = target.y - center.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "bottom" : "top";
}

function getBoundaryPointForSide(box: NodeBox, side: EdgeSide): Point {
  const center = getCenter(box);

  if (side === "left") {
    return getBoundaryPoint(box, { x: center.x - 1000, y: center.y });
  }

  if (side === "right") {
    return getBoundaryPoint(box, { x: center.x + 1000, y: center.y });
  }

  if (side === "top") {
    return getBoundaryPoint(box, { x: center.x, y: center.y - 1000 });
  }

  return getBoundaryPoint(box, { x: center.x, y: center.y + 1000 });
}

function offsetPoint(point: Point, side: EdgeSide, distance: number): Point {
  if (side === "left") {
    return { x: round(point.x - distance), y: point.y };
  }

  if (side === "right") {
    return { x: round(point.x + distance), y: point.y };
  }

  if (side === "top") {
    return { x: point.x, y: round(point.y - distance) };
  }

  return { x: point.x, y: round(point.y + distance) };
}

function getBoundaryPoint(box: NodeBox, toward: Point): Point {
  const center = getCenter(box);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return center;
  }

  if (box.shape === "circle") {
    return getEllipseBoundaryPoint(box, dx, dy);
  }

  if (box.shape === "diamond") {
    return getDiamondBoundaryPoint(box, dx, dy);
  }

  return getRectangleBoundaryPoint(box, dx, dy);
}

function getRectangleBoundaryPoint(box: NodeBox, dx: number, dy: number): Point {
  const center = getCenter(box);
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const scale = Math.min(
    Math.abs(dx) > 0.001 ? halfWidth / Math.abs(dx) : Number.POSITIVE_INFINITY,
    Math.abs(dy) > 0.001 ? halfHeight / Math.abs(dy) : Number.POSITIVE_INFINITY,
  );

  return {
    x: round(center.x + dx * scale),
    y: round(center.y + dy * scale),
  };
}

function getEllipseBoundaryPoint(box: NodeBox, dx: number, dy: number): Point {
  const center = getCenter(box);
  const radiusX = box.width / 2;
  const radiusY = box.height / 2;
  const scale = 1 / Math.sqrt((dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY));

  return {
    x: round(center.x + dx * scale),
    y: round(center.y + dy * scale),
  };
}

function getDiamondBoundaryPoint(box: NodeBox, dx: number, dy: number): Point {
  const center = getCenter(box);
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const scale = 1 / (Math.abs(dx) / halfWidth + Math.abs(dy) / halfHeight);

  return {
    x: round(center.x + dx * scale),
    y: round(center.y + dy * scale),
  };
}

function normalizePathPoints(points: Point[]): Point[] {
  return points.reduce<Point[]>((normalized, point) => {
    const previous = normalized[normalized.length - 1];

    if (previous && previous.x === point.x && previous.y === point.y) {
      return normalized;
    }

    if (normalized.length >= 2) {
      const secondPrevious = normalized[normalized.length - 2];

      if (
        (secondPrevious.x === previous?.x && previous?.x === point.x) ||
        (secondPrevious.y === previous?.y && previous?.y === point.y)
      ) {
        normalized[normalized.length - 1] = point;
        return normalized;
      }
    }

    normalized.push({
      x: round(point.x),
      y: round(point.y),
    });
    return normalized;
  }, []);
}

function isHorizontal(side: EdgeSide): boolean {
  return side === "left" || side === "right";
}

function getCenter(box: NodeBox): Point {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
