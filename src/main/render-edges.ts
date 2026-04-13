import type { DiagramEdge, DiagramLayoutEdge, DiagramLayoutResult, DiagramModel } from "../core";
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
    const endpoints = getEdgeEndpoints(edge, layoutEdge, context);

    if (!endpoints) {
      continue;
    }

    createEdgeGroup(edge, layoutEdge, endpoints, context);
  }
}

function createEdgeGroup(
  edge: DiagramEdge,
  layoutEdge: DiagramLayoutEdge,
  endpoints: { start: Point; end: Point },
  context: EdgeRenderContext,
): GroupNode {
  const edgeParts: SceneNode[] = [];
  const path = createEdgePath(endpoints.start, endpoints.end);
  context.rootFrame.appendChild(path);
  edgeParts.push(path);

  if (edge.kind === "arrow") {
    const arrowhead = createArrowhead(endpoints.start, endpoints.end);
    context.rootFrame.appendChild(arrowhead);
    edgeParts.push(arrowhead);
  }

  if (edge.label) {
    edgeParts.push(
      createEdgeLabel(edge.label, getLabelPosition(layoutEdge, endpoints, context), context),
    );
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

function getEdgeEndpoints(
  edge: DiagramEdge,
  layoutEdge: DiagramLayoutEdge,
  context: EdgeRenderContext,
): { start: Point; end: Point } | null {
  const points = layoutEdge.points.map((point) => toRootPoint(point, context));

  if (points.length >= 2) {
    return {
      start: points[0],
      end: points[points.length - 1],
    };
  }

  const from = context.layout.nodes.find((node) => node.id === edge.from);
  const to = context.layout.nodes.find((node) => node.id === edge.to);

  if (!from || !to) {
    return null;
  }

  return {
    start: toRootPoint({ x: from.x + from.width / 2, y: from.y + from.height / 2 }, context),
    end: toRootPoint({ x: to.x + to.width / 2, y: to.y + to.height / 2 }, context),
  };
}

function getLabelPosition(
  layoutEdge: DiagramLayoutEdge,
  endpoints: { start: Point; end: Point },
  context: EdgeRenderContext,
): Point {
  if (layoutEdge.labelPosition) {
    return toRootPoint(layoutEdge.labelPosition, context);
  }

  return {
    x: round((endpoints.start.x + endpoints.end.x) / 2),
    y: round((endpoints.start.y + endpoints.end.y) / 2),
  };
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

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
