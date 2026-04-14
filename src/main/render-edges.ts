import type {
  DiagramEdge,
  DiagramLayoutEdge,
  DiagramLayoutNode,
  DiagramLayoutResult,
  DiagramModel,
} from "../core";
import { buildOrthogonalPath, type EdgeSide, type NodeBox, type Point } from "./edge-routing";
import { estimateMultilineTextBox } from "./label-text";
import { setEdgeMetadata } from "./metadata";
import type { RenderSettings } from "./render";
import { applyMermaidLabelToTextNode } from "./text-formatting";

type EdgeRenderContext = {
  diagram: DiagramModel;
  instanceId: string;
  layout: DiagramLayoutResult;
  rootFrame: FrameNode;
  originX: number;
  originY: number;
  settings: RenderSettings;
  boldFontName: FontName;
  subgraphTitleHeights: Map<string, number>;
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
const subgraphTitleHeight = 28;

export function renderEdges(context: EdgeRenderContext): void {
  const parallelStageEdgeSides = getParallelStageEdgeSideOverrides(context.diagram);

  for (const edge of context.diagram.edges) {
    const layoutEdge = getLayoutEdge(edge.id, context.layout);
    const geometry = getEdgeGeometry(
      edge,
      layoutEdge,
      context,
      parallelStageEdgeSides.get(edge.id),
    );

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
  const path = createEdgePath(geometry.pathPoints, edge.kind, context);
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

function createEdgePath(
  points: Point[],
  edgeKind: DiagramEdge["kind"],
  context: EdgeRenderContext,
): VectorNode {
  const path = figma.createVector();
  path.name = "Edge Path";
  path.fills = [];
  path.strokes = [edgeStroke];
  path.strokeWeight = context.settings.strokeWidth;
  path.strokeJoin = context.settings.lineCornerRadius > 0 ? "ROUND" : "MITER";
  path.strokeCap = edgeKind === "arrow" ? "ARROW_LINES" : "NONE";
  path.vectorNetwork = toVectorNetwork(points, edgeKind);

  if ("cornerRadius" in path) {
    path.cornerRadius = context.settings.lineCornerRadius;
  }

  return path;
}

function createEdgeLabel(label: string, position: Point, context: EdgeRenderContext): GroupNode {
  const labelBox = estimateMultilineTextBox(label, {
    fontSize: context.settings.fontSize,
    horizontalPadding: 16,
    minHeight: 22,
    minWidth: 36,
    verticalPadding: 10,
  });
  const text = figma.createText();
  text.name = "Edge Label Text";
  text.fontName = context.settings.fontName;
  text.fontSize = context.settings.fontSize;
  text.fills = [edgeLabelFill];
  applyMermaidLabelToTextNode(text, label, {
    baseFontName: context.settings.fontName,
    boldFontName: context.boldFontName,
    fontSize: context.settings.fontSize,
  });
  text.textAlignHorizontal = "CENTER";
  text.textAlignVertical = "CENTER";

  const width = labelBox.width;
  const height = labelBox.height;
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
  sideOverrides: { startSide?: EdgeSide; endSide?: EdgeSide } | undefined,
): EdgeGeometry | null {
  const from = getNodeBox(edge.from, context);
  const to = getNodeBox(edge.to, context);

  if (!from || !to) {
    return null;
  }

  const routePoints = layoutEdge.points.map((point) => toRootPoint(point, context));
  const pathPoints = buildOrthogonalPath(from, to, routePoints, sideOverrides);

  return {
    pathPoints,
    labelPosition: getLabelPosition(layoutEdge, pathPoints, context),
  };
}

function getParallelStageEdgeSideOverrides(
  diagram: DiagramModel,
): Map<string, { startSide: EdgeSide; endSide: EdgeSide }> {
  if (diagram.direction !== "LR") {
    return new Map();
  }

  const nodeIds = new Set(diagram.nodes.map((node) => node.id));
  const outgoingByNode = new Map<string, Set<string>>();
  const edgeByPair = new Map<string, DiagramEdge>();

  for (const edge of diagram.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      continue;
    }

    const targets = outgoingByNode.get(edge.from) ?? new Set<string>();
    targets.add(edge.to);
    outgoingByNode.set(edge.from, targets);
    edgeByPair.set(`${edge.from}::${edge.to}`, edge);
  }

  const middleIdsByStage = new Map<string, Set<string>>();

  for (const [sourceId, targets] of outgoingByNode) {
    for (const middleId of targets) {
      const middleTargets = outgoingByNode.get(middleId);

      if (!middleTargets || middleTargets.size === 0) {
        continue;
      }

      for (const targetId of middleTargets) {
        if (targetId === sourceId || middleId === sourceId || middleId === targetId) {
          continue;
        }

        const stageKey = `${sourceId}::${targetId}`;
        const stageMiddles = middleIdsByStage.get(stageKey) ?? new Set<string>();
        stageMiddles.add(middleId);
        middleIdsByStage.set(stageKey, stageMiddles);
      }
    }
  }

  const overrides = new Map<string, { startSide: EdgeSide; endSide: EdgeSide }>();

  for (const [stageKey, middleIds] of middleIdsByStage) {
    if (middleIds.size < 3) {
      continue;
    }

    const [sourceId, targetId] = stageKey.split("::");

    for (const middleId of middleIds) {
      const ingress = edgeByPair.get(`${sourceId}::${middleId}`);
      const egress = edgeByPair.get(`${middleId}::${targetId}`);

      if (ingress) {
        overrides.set(ingress.id, {
          startSide: "right",
          endSide: "left",
        });
      }

      if (egress) {
        overrides.set(egress.id, {
          startSide: "right",
          endSide: "left",
        });
      }
    }
  }

  return overrides;
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
    height: layoutSubgraph.height + (context.subgraphTitleHeights.get(id) ?? subgraphTitleHeight),
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

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
