import type {
  DiagramEdge,
  DiagramLayoutEdge,
  DiagramLayoutNode,
  DiagramLayoutResult,
  DiagramModel,
  DiagramNode,
} from "../core";
import { setEdgeMetadata } from "./metadata";

type EdgeRenderContext = {
  diagram: DiagramModel;
  instanceId: string;
  layout: DiagramLayoutResult;
  rootFrame: FrameNode;
  originX: number;
  originY: number;
};

type Point = {
  x: number;
  y: number;
};

type NodeBox = {
  id: string;
  shape: DiagramNode["shape"];
  x: number;
  y: number;
  width: number;
  height: number;
};

type EdgeGeometry = {
  pathPoints: Point[];
  labelPosition: Point;
};

const edgeStroke: SolidPaint = { type: "SOLID", color: { r: 0.28, g: 0.32, b: 0.38 } };
const edgeLabelFill: SolidPaint = { type: "SOLID", color: { r: 0.1, g: 0.11, b: 0.13 } };
const edgeLabelBackground: SolidPaint = {
  type: "SOLID",
  color: { r: 0.96, g: 0.97, b: 0.98 },
  opacity: 0.92,
};
const edgeLabelFont: FontName = { family: "Inter", style: "Regular" };
const subgraphTitleHeight = 28;

export function renderEdges(context: EdgeRenderContext): void {
  for (const edge of context.diagram.edges) {
    const layoutEdge = getLayoutEdge(edge.id, context.layout);
    const geometry = getEdgeGeometry(edge, layoutEdge, context);

    if (!geometry) {
      continue;
    }

    createEdgeGroup(edge, geometry, context);
  }
}

function createEdgeGroup(
  edge: DiagramEdge,
  geometry: EdgeGeometry,
  context: EdgeRenderContext,
): GroupNode {
  const edgeParts: SceneNode[] = [];
  const path = createEdgePath(geometry.pathPoints, edge.kind);
  context.rootFrame.appendChild(path);
  edgeParts.push(path);

  if (edge.label) {
    edgeParts.push(createEdgeLabel(edge.label, geometry.labelPosition, context));
  }

  const group = figma.group(edgeParts, context.rootFrame);
  group.name = `Edge / ${edge.from} -> ${edge.to}`;
  setEdgeMetadata(group, edge, context.instanceId);
  return group;
}

function createEdgePath(points: Point[], edgeKind: DiagramEdge["kind"]): VectorNode {
  const path = figma.createVector();
  path.name = "Edge Path";
  path.fills = [];
  path.strokes = [edgeStroke];
  path.strokeWeight = 1.5;
  path.strokeCap = edgeKind === "arrow" ? "ARROW_LINES" : "NONE";
  path.vectorNetwork = toVectorNetwork(points, edgeKind);
  return path;
}

function createEdgeLabel(label: string, position: Point, context: EdgeRenderContext): GroupNode {
  const text = figma.createText();
  text.name = "Edge Label Text";
  text.fontName = edgeLabelFont;
  text.fontSize = 12;
  text.fills = [edgeLabelFill];
  text.characters = label;
  text.textAlignHorizontal = "CENTER";
  text.textAlignVertical = "CENTER";

  const width = Math.max(36, Math.ceil(label.length * 7) + 16);
  const height = 22;
  text.resizeWithoutConstraints(width, height);
  text.x = position.x - width / 2;
  text.y = position.y - height / 2;

  const background = figma.createRectangle();
  background.name = "Edge Label Background";
  background.fills = [edgeLabelBackground];
  background.strokes = [];
  background.cornerRadius = 4;
  background.resizeWithoutConstraints(width, height);
  background.x = text.x;
  background.y = text.y;

  context.rootFrame.appendChild(background);
  context.rootFrame.appendChild(text);

  const group = figma.group([background, text], context.rootFrame);
  group.name = "Edge Label";
  return group;
}

function getEdgeGeometry(
  edge: DiagramEdge,
  layoutEdge: DiagramLayoutEdge,
  context: EdgeRenderContext,
): EdgeGeometry | null {
  const from = getNodeBox(edge.from, context);
  const to = getNodeBox(edge.to, context);

  if (!from || !to) {
    return null;
  }

  const routePoints = layoutEdge.points.map((point) => toRootPoint(point, context));
  const fromCenter = getCenter(from);
  const toCenter = getCenter(to);
  const startTarget = routePoints[0] ?? toCenter;
  const endOrigin = routePoints[routePoints.length - 1] ?? fromCenter;
  const start = getBoundaryPoint(from, startTarget);
  const end = getBoundaryPoint(to, endOrigin);
  const pathPoints = normalizePathPoints([start, ...routePoints.slice(1, -1), end]);

  return {
    pathPoints,
    labelPosition: getLabelPosition(layoutEdge, pathPoints, context),
  };
}

function getLabelPosition(
  layoutEdge: DiagramLayoutEdge,
  pathPoints: Point[],
  context: EdgeRenderContext,
): Point {
  const midpoint = getPathMidpoint(pathPoints);

  if (!layoutEdge.labelPosition) {
    return offsetLabelFromPath(midpoint, pathPoints);
  }

  const candidate = toRootPoint(layoutEdge.labelPosition, context);

  if (isPointInsideAnyNode(candidate, context)) {
    return offsetLabelFromPath(midpoint, pathPoints);
  }

  return candidate;
}

function getLayoutEdge(id: string, layout: DiagramLayoutResult): DiagramLayoutEdge {
  const edge = layout.edges.find((entry) => entry.id === id);

  if (!edge) {
    throw new Error(`Missing layout for edge "${id}".`);
  }

  return edge;
}

function toRootPoint(point: Point, context: EdgeRenderContext): Point {
  return {
    x: round(point.x - context.originX),
    y: round(point.y - context.originY),
  };
}

function getNodeBox(id: string, context: EdgeRenderContext): NodeBox | null {
  const layoutNode = context.layout.nodes.find((node) => node.id === id);
  const diagramNode = context.diagram.nodes.find((node) => node.id === id);

  if (layoutNode && diagramNode) {
    return {
      id,
      shape: diagramNode.shape,
      x: layoutNode.x - context.originX,
      y: layoutNode.y - context.originY,
      width: layoutNode.width,
      height: layoutNode.height,
    };
  }

  const layoutSubgraph = context.layout.subgraphs.find((subgraph) => subgraph.id === id);

  if (!layoutSubgraph) {
    return null;
  }

  return {
    id,
    shape: "rectangle",
    x: layoutSubgraph.x - context.originX,
    y: layoutSubgraph.y - context.originY,
    width: layoutSubgraph.width,
    height: layoutSubgraph.height + subgraphTitleHeight,
  };
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

function offsetLabelFromPath(position: Point, pathPoints: Point[]): Point {
  const [start, end] = getLabelSegment(pathPoints);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);

  if (length < 0.001) {
    return position;
  }

  const offset = Math.abs(dx) > Math.abs(dy) ? 16 : 12;

  return {
    x: round(position.x + (-dy / length) * offset),
    y: round(position.y + (dx / length) * offset),
  };
}

function getLabelSegment(pathPoints: Point[]): [Point, Point] {
  if (pathPoints.length < 2) {
    const point = pathPoints[0] ?? { x: 0, y: 0 };
    return [point, point];
  }

  const middleIndex = Math.max(0, Math.floor((pathPoints.length - 1) / 2));
  return [pathPoints[middleIndex], pathPoints[middleIndex + 1] ?? pathPoints[middleIndex]];
}

function getPathMidpoint(pathPoints: Point[]): Point {
  if (pathPoints.length === 0) {
    return { x: 0, y: 0 };
  }

  if (pathPoints.length === 1) {
    return pathPoints[0];
  }

  const segments = [];
  let totalLength = 0;

  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    const start = pathPoints[index];
    const end = pathPoints[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    totalLength += length;
    segments.push({ start, end, length });
  }

  let remaining = totalLength / 2;

  for (const segment of segments) {
    if (remaining > segment.length) {
      remaining -= segment.length;
      continue;
    }

    const ratio = segment.length < 0.001 ? 0 : remaining / segment.length;
    return {
      x: round(segment.start.x + (segment.end.x - segment.start.x) * ratio),
      y: round(segment.start.y + (segment.end.y - segment.start.y) * ratio),
    };
  }

  return pathPoints[pathPoints.length - 1];
}

function normalizePathPoints(points: Point[]): Point[] {
  return points.reduce<Point[]>((normalized, point) => {
    const previous = normalized[normalized.length - 1];

    if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 0.5) {
      return normalized;
    }

    normalized.push({
      x: round(point.x),
      y: round(point.y),
    });
    return normalized;
  }, []);
}

function toVectorNetwork(points: Point[], edgeKind: DiagramEdge["kind"]): VectorNetwork {
  const normalizedPoints = points.length > 0 ? points : [{ x: 0, y: 0 }];
  const lastIndex = normalizedPoints.length - 1;

  return {
    vertices: normalizedPoints.map((point, index) => ({
      x: round(point.x),
      y: round(point.y),
      strokeCap: edgeKind === "arrow" && index === lastIndex ? "ARROW_LINES" : "NONE",
    })),
    segments: normalizedPoints.slice(0, -1).map((_point, index) => ({
      start: index,
      end: index + 1,
    })),
    regions: [],
  };
}

function isPointInsideAnyNode(point: Point, context: EdgeRenderContext): boolean {
  return context.layout.nodes.some((node) => {
    const box = toRootNodeBox(node, context);
    return (
      point.x >= box.x - 4 &&
      point.x <= box.x + box.width + 4 &&
      point.y >= box.y - 4 &&
      point.y <= box.y + box.height + 4
    );
  });
}

function toRootNodeBox(node: DiagramLayoutNode, context: EdgeRenderContext): NodeBox {
  const diagramNode = context.diagram.nodes.find((entry) => entry.id === node.id);

  return {
    id: node.id,
    shape: diagramNode?.shape ?? "rectangle",
    x: node.x - context.originX,
    y: node.y - context.originY,
    width: node.width,
    height: node.height,
  };
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
