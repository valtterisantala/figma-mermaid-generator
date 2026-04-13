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
  lineStart: Point;
  lineEnd: Point;
  arrowTip?: Point;
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
const arrowheadLength = 12;
const arrowheadWidth = 10;

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
  const path = createEdgePath(geometry.lineStart, geometry.lineEnd);
  context.rootFrame.appendChild(path);
  edgeParts.push(path);

  if (edge.kind === "arrow" && geometry.arrowTip) {
    const arrowhead = createArrowhead(geometry.lineStart, geometry.arrowTip);
    context.rootFrame.appendChild(arrowhead);
    edgeParts.push(arrowhead);
  }

  if (edge.label) {
    edgeParts.push(createEdgeLabel(edge.label, geometry.labelPosition, context));
  }

  const group = figma.group(edgeParts, context.rootFrame);
  group.name = `Edge / ${edge.from} -> ${edge.to}`;
  setEdgeMetadata(group, edge, context.instanceId);
  return group;
}

function createEdgePath(start: Point, end: Point): VectorNode {
  const path = figma.createVector();
  path.name = "Edge Path";
  path.fills = [];
  path.strokes = [edgeStroke];
  path.strokeWeight = 1.5;
  path.vectorPaths = [
    {
      windingRule: "NONE",
      data: `M ${round(start.x)} ${round(start.y)} L ${round(end.x)} ${round(end.y)}`,
    },
  ];
  return path;
}

function createArrowhead(start: Point, end: Point): VectorNode {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const back = {
    x: end.x - Math.cos(angle) * arrowheadLength,
    y: end.y - Math.sin(angle) * arrowheadLength,
  };
  const normal = {
    x: Math.cos(angle + Math.PI / 2),
    y: Math.sin(angle + Math.PI / 2),
  };
  const left = {
    x: back.x + normal.x * (arrowheadWidth / 2),
    y: back.y + normal.y * (arrowheadWidth / 2),
  };
  const right = {
    x: back.x - normal.x * (arrowheadWidth / 2),
    y: back.y - normal.y * (arrowheadWidth / 2),
  };
  const arrowhead = figma.createVector();
  arrowhead.name = "Edge Arrowhead";
  arrowhead.fills = [edgeStroke];
  arrowhead.strokes = [];
  arrowhead.vectorPaths = [
    {
      windingRule: "NONZERO",
      data: `M ${round(end.x)} ${round(end.y)} L ${round(left.x)} ${round(left.y)} L ${round(right.x)} ${round(right.y)} Z`,
    },
  ];
  return arrowhead;
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
  const lineEnd = edge.kind === "arrow" ? retreatPoint(end, start, arrowheadLength * 0.72) : end;

  return {
    lineStart: start,
    lineEnd,
    arrowTip: edge.kind === "arrow" ? end : undefined,
    labelPosition: getLabelPosition(layoutEdge, { start, end }, context),
  };
}

function getLabelPosition(
  layoutEdge: DiagramLayoutEdge,
  endpoints: { start: Point; end: Point },
  context: EdgeRenderContext,
): Point {
  const midpoint = {
    x: round((endpoints.start.x + endpoints.end.x) / 2),
    y: round((endpoints.start.y + endpoints.end.y) / 2),
  };

  if (!layoutEdge.labelPosition) {
    return offsetLabelFromLine(midpoint, endpoints);
  }

  const candidate = toRootPoint(layoutEdge.labelPosition, context);

  if (isPointInsideAnyNode(candidate, context)) {
    return offsetLabelFromLine(midpoint, endpoints);
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

  if (!layoutNode || !diagramNode) {
    return null;
  }

  return {
    id,
    shape: diagramNode.shape,
    x: layoutNode.x - context.originX,
    y: layoutNode.y - context.originY,
    width: layoutNode.width,
    height: layoutNode.height,
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

function retreatPoint(point: Point, awayFrom: Point, distance: number): Point {
  const dx = point.x - awayFrom.x;
  const dy = point.y - awayFrom.y;
  const length = Math.hypot(dx, dy);

  if (length <= distance || length < 0.001) {
    return point;
  }

  return {
    x: round(point.x - (dx / length) * distance),
    y: round(point.y - (dy / length) * distance),
  };
}

function offsetLabelFromLine(position: Point, endpoints: { start: Point; end: Point }): Point {
  const dx = endpoints.end.x - endpoints.start.x;
  const dy = endpoints.end.y - endpoints.start.y;
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
