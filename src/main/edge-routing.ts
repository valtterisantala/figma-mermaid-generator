import type { DiagramDirection, DiagramNode } from "../core";

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

export type EdgeRoutingBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type RoutableEdge = {
  id: string;
  from: string;
  to: string;
};

export type EdgeRoutingPlan = {
  mode: "forward" | "fanout" | "feedback";
  startSide: EdgeSide;
  endSide: EdgeSide;
  lane: number;
  fanOutTrunk?: number;
};

export type CollapsedReturnGroup = {
  id: string;
  edgeIds: string[];
  sourceIds: string[];
  targetId: string;
};

export type DiagramEdgePathInput = {
  bounds: EdgeRoutingBounds;
  direction: DiagramDirection;
  from: NodeBox;
  plan: EdgeRoutingPlan;
  routeHints: Point[];
  to: NodeBox;
};

export type CollapsedReturnPathInput = {
  bounds: EdgeRoutingBounds;
  direction: DiagramDirection;
  group: CollapsedReturnGroup;
  nodeBoxes: Map<string, NodeBox>;
  obstacles: NodeBox[];
};

const defaultStubLength = 20;
const feedbackLaneGap = 24;
const feedbackMargin = 40;
const fanOutTrunkGap = 56;
const collapsedReturnMargin = 48;

export function getConnectionAnchor(box: NodeBox, side: EdgeSide): Point {
  return getBoundaryPointForSide(box, side);
}

export function createEdgeRoutingPlans(
  edges: RoutableEdge[],
  nodeBoxes: Map<string, NodeBox>,
  direction: DiagramDirection,
): Map<string, EdgeRoutingPlan> {
  const outgoingBySource = new Map<string, RoutableEdge[]>();

  for (const edge of edges) {
    const outgoing = outgoingBySource.get(edge.from) ?? [];
    outgoing.push(edge);
    outgoingBySource.set(edge.from, outgoing);
  }

  const feedbackLaneByTarget = new Map<string, number>();
  const fanOutTrunkBySource = new Map<string, number>();
  const plans = new Map<string, EdgeRoutingPlan>();

  for (const edge of edges) {
    const from = nodeBoxes.get(edge.from);
    const to = nodeBoxes.get(edge.to);

    if (!from || !to) {
      continue;
    }

    if (isBackwardEdge(from, to, direction)) {
      const lane = feedbackLaneByTarget.get(edge.to) ?? 0;
      feedbackLaneByTarget.set(edge.to, lane + 1);
      plans.set(edge.id, {
        mode: "feedback",
        startSide: direction === "LR" ? "bottom" : "right",
        endSide: direction === "LR" ? "bottom" : "right",
        lane,
      });
      continue;
    }

    const outgoing = outgoingBySource.get(edge.from) ?? [];
    const forwardOutgoing = outgoing.filter((candidate) => {
      const candidateTarget = nodeBoxes.get(candidate.to);
      return candidateTarget ? !isBackwardEdge(from, candidateTarget, direction) : false;
    });

    if (forwardOutgoing.length >= 3) {
      const lane = getFanOutLane(edge, forwardOutgoing, nodeBoxes, direction);
      const trunk = fanOutTrunkBySource.get(edge.from) ?? getFanOutTrunk(from, to, direction);
      fanOutTrunkBySource.set(edge.from, trunk);
      plans.set(edge.id, {
        mode: "fanout",
        startSide: direction === "LR" ? "right" : "bottom",
        endSide: direction === "LR" ? "left" : "top",
        lane,
        fanOutTrunk: trunk,
      });
      continue;
    }

    plans.set(edge.id, {
      mode: "forward",
      startSide: direction === "LR" ? "right" : "bottom",
      endSide: direction === "LR" ? "left" : "top",
      lane: 0,
    });
  }

  return plans;
}

export function createCollapsedReturnGroups(
  edges: RoutableEdge[],
  nodeBoxes: Map<string, NodeBox>,
  direction: DiagramDirection,
  collapseReturnEdges: boolean,
): CollapsedReturnGroup[] {
  if (!collapseReturnEdges) {
    return [];
  }

  const backwardEdgesByTarget = new Map<string, RoutableEdge[]>();

  for (const edge of edges) {
    const from = nodeBoxes.get(edge.from);
    const to = nodeBoxes.get(edge.to);

    if (!from || !to || !isBackwardEdge(from, to, direction)) {
      continue;
    }

    const backwardEdges = backwardEdgesByTarget.get(edge.to) ?? [];
    backwardEdges.push(edge);
    backwardEdgesByTarget.set(edge.to, backwardEdges);
  }

  return [...backwardEdgesByTarget.entries()]
    .filter((entry) => entry[1].length >= 2)
    .map(([targetId, backwardEdges]) => ({
      id: `collapsed_return_${targetId}_${backwardEdges.map((edge) => edge.from).join("_")}`,
      edgeIds: backwardEdges.map((edge) => edge.id),
      sourceIds: backwardEdges.map((edge) => edge.from),
      targetId,
    }));
}

export function getNodeBounds(boxes: NodeBox[]): EdgeRoutingBounds {
  if (boxes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    };
  }

  return {
    minX: Math.min(...boxes.map((box) => box.x)),
    minY: Math.min(...boxes.map((box) => box.y)),
    maxX: Math.max(...boxes.map((box) => box.x + box.width)),
    maxY: Math.max(...boxes.map((box) => box.y + box.height)),
  };
}

export function buildCollapsedReturnPath(input: CollapsedReturnPathInput): Point[] {
  const target = input.nodeBoxes.get(input.group.targetId);
  const sourceBoxes = input.group.sourceIds
    .map((sourceId) => input.nodeBoxes.get(sourceId))
    .filter((box): box is NodeBox => Boolean(box));

  if (!target || sourceBoxes.length === 0) {
    return [];
  }

  const sourceGroup = unionNodeBoxes("collapsed-return-sources", sourceBoxes);
  const candidates =
    input.direction === "LR"
      ? [
          buildCollapsedLrCandidate(sourceGroup, target, input.bounds, "bottom"),
          buildCollapsedLrCandidate(sourceGroup, target, input.bounds, "top"),
        ]
      : [
          buildCollapsedTdCandidate(sourceGroup, target, input.bounds, "left"),
          buildCollapsedTdCandidate(sourceGroup, target, input.bounds, "right"),
        ];
  const ignoredIds = new Set([...input.group.sourceIds, input.group.targetId]);

  return candidates
    .map((candidate) => ({
      points: candidate,
      score:
        input.direction === "LR" && isBottomCollapsedPath(candidate, input.bounds)
          ? scoreCollapsedPath(candidate, input.bounds, input.obstacles, ignoredIds) - 5000
          : scoreCollapsedPath(candidate, input.bounds, input.obstacles, ignoredIds),
    }))
    .reduce((winner, candidate) => (candidate.score < winner.score ? candidate : winner)).points;
}

export function buildDiagramEdgePath(input: DiagramEdgePathInput): Point[] {
  if (input.plan.mode === "feedback") {
    return buildFeedbackPath(input);
  }

  if (input.plan.mode === "fanout" && input.plan.fanOutTrunk !== undefined) {
    return buildFanOutPath(input);
  }

  return buildOrthogonalPath(input.from, input.to, input.routeHints, {
    startSide: input.plan.startSide,
    endSide: input.plan.endSide,
  });
}

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
  const start = getConnectionAnchor(from, startSide);
  const end = getConnectionAnchor(to, endSide);
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

export function pathIntersectsNodeBox(points: Point[], box: NodeBox): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (segmentIntersectsBox(points[index], points[index + 1], box)) {
      return true;
    }
  }

  return false;
}

function buildCollapsedLrCandidate(
  sourceGroup: NodeBox,
  target: NodeBox,
  bounds: EdgeRoutingBounds,
  side: "top" | "bottom",
): Point[] {
  const startSide: EdgeSide = side;
  const endSide: EdgeSide = side;
  const start = getConnectionAnchor(sourceGroup, startSide);
  const end = getConnectionAnchor(target, endSide);
  const startStub = offsetPoint(start, startSide, defaultStubLength);
  const endStub = offsetPoint(end, endSide, defaultStubLength);
  const corridorY =
    side === "top"
      ? Math.min(
          bounds.minY - collapsedReturnMargin,
          startStub.y - collapsedReturnMargin,
          endStub.y - collapsedReturnMargin,
        )
      : Math.max(
          bounds.maxY + collapsedReturnMargin,
          startStub.y + collapsedReturnMargin,
          endStub.y + collapsedReturnMargin,
        );

  return normalizePathPoints([
    start,
    startStub,
    { x: startStub.x, y: round(corridorY) },
    { x: endStub.x, y: round(corridorY) },
    endStub,
    end,
  ]);
}

function buildCollapsedTdCandidate(
  sourceGroup: NodeBox,
  target: NodeBox,
  bounds: EdgeRoutingBounds,
  side: "left" | "right",
): Point[] {
  const startSide: EdgeSide = side;
  const endSide: EdgeSide = side;
  const start = getConnectionAnchor(sourceGroup, startSide);
  const end = getConnectionAnchor(target, endSide);
  const startStub = offsetPoint(start, startSide, defaultStubLength);
  const endStub = offsetPoint(end, endSide, defaultStubLength);
  const corridorX =
    side === "left"
      ? Math.min(
          bounds.minX - collapsedReturnMargin,
          startStub.x - collapsedReturnMargin,
          endStub.x - collapsedReturnMargin,
        )
      : Math.max(
          bounds.maxX + collapsedReturnMargin,
          startStub.x + collapsedReturnMargin,
          endStub.x + collapsedReturnMargin,
        );

  return normalizePathPoints([
    start,
    startStub,
    { x: round(corridorX), y: startStub.y },
    { x: round(corridorX), y: endStub.y },
    endStub,
    end,
  ]);
}

function scoreCollapsedPath(
  points: Point[],
  bounds: EdgeRoutingBounds,
  obstacles: NodeBox[],
  ignoredIds: Set<string>,
): number {
  const pathBounds = getPointBounds(points);
  const length = getPathLength(points);
  const intersections = obstacles.filter(
    (obstacle) => !ignoredIds.has(obstacle.id) && pathIntersectsNodeBox(points, obstacle),
  ).length;
  const expansion =
    Math.max(0, bounds.minX - pathBounds.minX) +
    Math.max(0, pathBounds.maxX - bounds.maxX) +
    Math.max(0, bounds.minY - pathBounds.minY) +
    Math.max(0, pathBounds.maxY - bounds.maxY);

  return length + intersections * 10000 + expansion * 2;
}

function isBottomCollapsedPath(points: Point[], bounds: EdgeRoutingBounds): boolean {
  return points.some((point) => point.y > bounds.maxY);
}

function unionNodeBoxes(id: string, boxes: NodeBox[]): NodeBox {
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));

  return {
    id,
    shape: "rectangle",
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getPointBounds(points: Point[]): EdgeRoutingBounds {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function getPathLength(points: Point[]): number {
  return points.slice(0, -1).reduce((length, point, index) => {
    const next = points[index + 1];
    return length + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
}

function buildFeedbackPath(input: DiagramEdgePathInput): Point[] {
  const start = getConnectionAnchor(input.from, input.plan.startSide);
  const end = getConnectionAnchor(input.to, input.plan.endSide);
  const startStub = offsetPoint(start, input.plan.startSide, defaultStubLength);
  const endStub = offsetPoint(end, input.plan.endSide, defaultStubLength);
  const laneOffset = feedbackMargin + input.plan.lane * feedbackLaneGap;

  if (input.direction === "LR") {
    const corridorY = round(
      Math.max(
        input.bounds.maxY + laneOffset,
        startStub.y + feedbackMargin,
        endStub.y + feedbackMargin,
      ),
    );

    return normalizePathPoints([
      start,
      startStub,
      { x: startStub.x, y: corridorY },
      { x: endStub.x, y: corridorY },
      endStub,
      end,
    ]);
  }

  const corridorX = round(
    Math.max(
      input.bounds.maxX + laneOffset,
      startStub.x + feedbackMargin,
      endStub.x + feedbackMargin,
    ),
  );

  return normalizePathPoints([
    start,
    startStub,
    { x: corridorX, y: startStub.y },
    { x: corridorX, y: endStub.y },
    endStub,
    end,
  ]);
}

function buildFanOutPath(input: DiagramEdgePathInput): Point[] {
  const start = getConnectionAnchor(input.from, input.plan.startSide);
  const end = getConnectionAnchor(input.to, input.plan.endSide);
  const startStub = offsetPoint(start, input.plan.startSide, defaultStubLength);
  const endStub = offsetPoint(end, input.plan.endSide, defaultStubLength);
  const trunk = input.plan.fanOutTrunk;

  if (trunk === undefined) {
    return buildOrthogonalPath(input.from, input.to, input.routeHints, {
      startSide: input.plan.startSide,
      endSide: input.plan.endSide,
    });
  }

  if (input.direction === "LR") {
    return normalizePathPoints([
      start,
      startStub,
      { x: trunk, y: startStub.y },
      { x: trunk, y: endStub.y },
      endStub,
      end,
    ]);
  }

  return normalizePathPoints([
    start,
    startStub,
    { x: startStub.x, y: trunk },
    { x: endStub.x, y: trunk },
    endStub,
    end,
  ]);
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

function isBackwardEdge(from: NodeBox, to: NodeBox, direction: DiagramDirection): boolean {
  const fromCenter = getCenter(from);
  const toCenter = getCenter(to);

  if (direction === "LR") {
    return toCenter.x < fromCenter.x;
  }

  return toCenter.y < fromCenter.y;
}

function getFanOutLane(
  edge: RoutableEdge,
  outgoing: RoutableEdge[],
  nodeBoxes: Map<string, NodeBox>,
  direction: DiagramDirection,
): number {
  const axis = direction === "LR" ? "y" : "x";
  const sorted = [...outgoing].sort((left, right) => {
    const leftBox = nodeBoxes.get(left.to);
    const rightBox = nodeBoxes.get(right.to);
    const leftCenter = leftBox ? getCenter(leftBox)[axis] : 0;
    const rightCenter = rightBox ? getCenter(rightBox)[axis] : 0;
    return leftCenter - rightCenter || left.id.localeCompare(right.id);
  });

  return Math.max(
    0,
    sorted.findIndex((candidate) => candidate.id === edge.id),
  );
}

function getFanOutTrunk(from: NodeBox, firstTarget: NodeBox, direction: DiagramDirection): number {
  if (direction === "LR") {
    const sourceRight = from.x + from.width;
    const targetLeft = firstTarget.x;
    const availableGap = targetLeft - sourceRight;

    if (availableGap > fanOutTrunkGap * 1.5) {
      return round(sourceRight + availableGap * 0.45);
    }

    return round(sourceRight + fanOutTrunkGap);
  }

  const sourceBottom = from.y + from.height;
  const targetTop = firstTarget.y;
  const availableGap = targetTop - sourceBottom;

  if (availableGap > fanOutTrunkGap * 1.5) {
    return round(sourceBottom + availableGap * 0.45);
  }

  return round(sourceBottom + fanOutTrunkGap);
}

function segmentIntersectsBox(start: Point, end: Point, box: NodeBox): boolean {
  const minX = box.x;
  const maxX = box.x + box.width;
  const minY = box.y;
  const maxY = box.y + box.height;

  if (start.x === end.x) {
    const y1 = Math.min(start.y, end.y);
    const y2 = Math.max(start.y, end.y);
    return start.x >= minX && start.x <= maxX && y2 >= minY && y1 <= maxY;
  }

  if (start.y === end.y) {
    const x1 = Math.min(start.x, end.x);
    const x2 = Math.max(start.x, end.x);
    return start.y >= minY && start.y <= maxY && x2 >= minX && x1 <= maxX;
  }

  return false;
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
