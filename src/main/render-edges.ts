import type {
  DiagramEdge,
  DiagramLayoutEdge,
  DiagramLayoutNode,
  DiagramLayoutResult,
  DiagramModel,
  DiagramNode,
} from "../core";
import {
  buildCollapsedReturnPath,
  buildDiagramEdgePath,
  createCollapsedReturnGroups,
  createEdgeRoutingPlans,
  getNodeBounds,
  type CollapsedReturnGroup,
  type EdgeRoutingBounds,
  type EdgeRoutingPlan,
  type EdgeSide,
  type NodeBox,
  type Point,
  pathIntersectsNodeBox,
} from "./edge-routing";
import { estimateMultilineTextBox } from "./label-text";
import { setCollapsedReturnEdgeMetadata, setEdgeMetadata } from "./metadata";
import type { ConnectorSettings, RenderSettings } from "./render";
import { getVisibleAncestorSubgraphId } from "./subgraph-visibility";
import { applyMermaidLabelToTextNode } from "./text-formatting";
import { renderMermaidLabelText } from "../core/text";

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
  subgraphFrames: Map<string, FrameNode>;
};

type EdgeGeometry = {
  pathPoints: Point[];
  labelPosition: Point;
};

export type EdgeRenderResult = {
  edgeGroups: Map<string, GroupNode>;
  edgeLabelGroups: Map<string, GroupNode>;
};

export type VisualNodeBoxInput = {
  diagramNode: Pick<DiagramNode, "id" | "shape" | "subgraphId">;
  layoutNode: DiagramLayoutNode;
  originX: number;
  originY: number;
  parentTitleHeight?: number;
};

const debugEdgeAnchors = false;
const edgeStroke: SolidPaint = { type: "SOLID", color: { r: 0.28, g: 0.32, b: 0.38 } };
const edgeLabelFill: SolidPaint = { type: "SOLID", color: { r: 0.1, g: 0.11, b: 0.13 } };
const edgeLabelBackground: SolidPaint = {
  type: "SOLID",
  color: { r: 0.96, g: 0.97, b: 0.98 },
  opacity: 0.92,
};
const subgraphTitleHeight = 28;

export function renderEdges(
  context: EdgeRenderContext,
  connectorSettings: ConnectorSettings,
): EdgeRenderResult {
  const parallelStageEdgeSides = getParallelStageEdgeSideOverrides(context.diagram);
  const routableBoxes = getRoutableEndpointBoxes(context);
  const collapsedReturnGroups = createCollapsedReturnGroups(
    context.diagram.edges,
    routableBoxes,
    context.diagram.direction,
    connectorSettings.collapseReturnEdges,
  );
  const collapsedEdgeIds = new Set(collapsedReturnGroups.flatMap((group) => group.edgeIds));
  const routingPlans = createEdgeRoutingPlans(
    context.diagram.edges,
    routableBoxes,
    context.diagram.direction,
  );
  const routingBounds = getNodeBounds(getAllRoutingBoundsBoxes(context, routableBoxes));
  const edgeGroups = new Map<string, GroupNode>();
  const edgeLabelGroups = new Map<string, GroupNode>();

  for (const edge of context.diagram.edges) {
    if (collapsedEdgeIds.has(edge.id)) {
      continue;
    }

    const layoutEdge = getLayoutEdge(edge.id, context.layout);
    const geometry = getEdgeGeometry(
      edge,
      layoutEdge,
      context,
      routingPlans.get(edge.id),
      routingBounds,
      parallelStageEdgeSides.get(edge.id),
    );

    if (!geometry) {
      continue;
    }

    const result = createEdgeGroup(edge, geometry, context);
    edgeGroups.set(edge.id, result.edgeGroup);

    if (result.edgeLabelGroup) {
      edgeLabelGroups.set(edge.id, result.edgeLabelGroup);
    }
  }

  for (const collapsedGroup of collapsedReturnGroups) {
    const result = createCollapsedReturnEdgeGroup(
      collapsedGroup,
      routableBoxes,
      routingBounds,
      context,
    );

    if (!result) {
      continue;
    }

    edgeGroups.set(collapsedGroup.id, result.edgeGroup);
    edgeLabelGroups.set(collapsedGroup.id, result.edgeLabelGroup);
  }

  return {
    edgeGroups,
    edgeLabelGroups,
  };
}

function createCollapsedReturnEdgeGroup(
  collapsedGroup: CollapsedReturnGroup,
  nodeBoxes: Map<string, NodeBox>,
  routingBounds: EdgeRoutingBounds,
  context: EdgeRenderContext,
): { edgeGroup: GroupNode; edgeLabelGroup: GroupNode } | null {
  const pathPoints = buildCollapsedReturnPath({
    bounds: routingBounds,
    direction: context.diagram.direction,
    group: collapsedGroup,
    nodeBoxes,
    obstacles: getAllRoutingBoundsBoxes(context, nodeBoxes),
  });

  if (pathPoints.length < 2) {
    return null;
  }

  const label = getCollapsedReturnLabel(collapsedGroup, context.diagram);
  const representativeEdge = getRepresentativeCollapsedEdge(collapsedGroup, label, context.diagram);
  const parent = context.rootFrame;
  const path = createEdgePath(pathPoints, representativeEdge, context);
  parent.appendChild(path);
  const edgeLabelGroup = createEdgeLabel(label, getPathMidpoint(pathPoints), context, parent);
  const edgeGroup = figma.group([path], parent);
  edgeGroup.name = `Edge / Collapsed returns -> ${collapsedGroup.targetId}`;
  setCollapsedReturnEdgeMetadata(
    edgeGroup,
    {
      edgeIds: collapsedGroup.edgeIds,
      sourceId: representativeEdge.sourceId,
      sourceIds: collapsedGroup.sourceIds,
      targetId: collapsedGroup.targetId,
    },
    context.instanceId,
  );

  logCollapsedReturnDebug(collapsedGroup, pathPoints, context);

  return {
    edgeGroup,
    edgeLabelGroup,
  };
}

function createEdgeGroup(
  edge: DiagramEdge,
  geometry: EdgeGeometry,
  context: EdgeRenderContext,
): { edgeGroup: GroupNode; edgeLabelGroup?: GroupNode } {
  const parentInfo = getEdgeRenderParent(edge, context);
  const parent = parentInfo.frame;
  const localGeometry = toLocalEdgeGeometry(geometry, parentInfo.offset);
  const edgeParts: SceneNode[] = [];
  const path = createEdgePath(localGeometry.pathPoints, edge, context);
  parent.appendChild(path);
  edgeParts.push(path);

  let edgeLabelGroup: GroupNode | undefined;

  if (edge.label) {
    edgeLabelGroup = createEdgeLabel(edge.label, localGeometry.labelPosition, context, parent);
  }

  const group = figma.group(edgeParts, parent);
  group.name = `Edge / ${edge.from} -> ${edge.to}`;
  setEdgeMetadata(group, edge, context.instanceId);
  return {
    edgeGroup: group,
    edgeLabelGroup,
  };
}

function getRepresentativeCollapsedEdge(
  collapsedGroup: CollapsedReturnGroup,
  label: string,
  diagram: DiagramModel,
): DiagramEdge {
  const firstEdge = collapsedGroup.edgeIds
    .map((edgeId) => diagram.edges.find((edge) => edge.id === edgeId))
    .find((edge): edge is DiagramEdge => Boolean(edge));
  const firstSourceId = collapsedGroup.sourceIds[0] ?? collapsedGroup.targetId;

  return {
    id: collapsedGroup.id,
    sourceId: collapsedGroup.id,
    from: firstSourceId,
    to: collapsedGroup.targetId,
    kind: firstEdge?.kind ?? "arrow",
    dashed: firstEdge?.dashed,
    label,
    classIds: [],
  };
}

function getEdgeRenderParent(
  edge: DiagramEdge,
  context: EdgeRenderContext,
): { frame: FrameNode; offset: Point } {
  const visibleSubgraphId = getVisibleAncestorSubgraphId(context.diagram, edge.subgraphId);
  const frame = visibleSubgraphId ? context.subgraphFrames.get(visibleSubgraphId) : undefined;
  const layoutSubgraph = visibleSubgraphId
    ? context.layout.subgraphs.find((subgraph) => subgraph.id === visibleSubgraphId)
    : undefined;

  if (!frame || !layoutSubgraph) {
    return {
      frame: context.rootFrame,
      offset: { x: 0, y: 0 },
    };
  }

  return {
    frame,
    offset: {
      x: layoutSubgraph.x - context.originX,
      y: layoutSubgraph.y - context.originY,
    },
  };
}

function toLocalEdgeGeometry(geometry: EdgeGeometry, offset: Point): EdgeGeometry {
  return {
    pathPoints: geometry.pathPoints.map((point) => ({
      x: round(point.x - offset.x),
      y: round(point.y - offset.y),
    })),
    labelPosition: {
      x: round(geometry.labelPosition.x - offset.x),
      y: round(geometry.labelPosition.y - offset.y),
    },
  };
}

function createEdgePath(
  points: Point[],
  edge: DiagramEdge,
  context: EdgeRenderContext,
): VectorNode {
  const path = figma.createVector();
  path.name = "Edge Path";
  path.fills = [];
  path.strokes = [edgeStroke];
  path.strokeWeight = context.settings.strokeWidth;
  path.strokeJoin = context.settings.lineCornerRadius > 0 ? "ROUND" : "MITER";
  path.strokeCap = edge.kind === "arrow" ? "ARROW_LINES" : "NONE";
  path.vectorNetwork = toVectorNetwork(points, edge.kind);
  path.dashPattern = edge.dashed ? [8, 6] : [];

  if ("cornerRadius" in path) {
    path.cornerRadius = context.settings.lineCornerRadius;
  }

  return path;
}

function createEdgeLabel(
  label: string,
  position: Point,
  context: EdgeRenderContext,
  parent: FrameNode,
): GroupNode {
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

  parent.appendChild(background);
  parent.appendChild(text);

  const group = figma.group([background, text], parent);
  group.name = "Edge Label";
  return group;
}

function getEdgeGeometry(
  edge: DiagramEdge,
  layoutEdge: DiagramLayoutEdge,
  context: EdgeRenderContext,
  routingPlan: EdgeRoutingPlan | undefined,
  routingBounds: EdgeRoutingBounds,
  sideOverrides: { startSide?: EdgeSide; endSide?: EdgeSide } | undefined,
): EdgeGeometry | null {
  const from = getNodeBox(edge.from, context);
  const to = getNodeBox(edge.to, context);

  if (!from || !to) {
    return null;
  }

  const routePoints = layoutEdge.points.map((point) => toRootPoint(point, context));
  const resolvedPlan = {
    ...(routingPlan ?? getDefaultRoutingPlan(context.diagram.direction)),
    ...sideOverrides,
  };
  const pathPoints = buildDiagramEdgePath({
    bounds: routingBounds,
    direction: context.diagram.direction,
    from,
    plan: resolvedPlan,
    routeHints: routePoints,
    to,
  });
  logEdgeAnchorDebug(edge, from, to, pathPoints, context, resolvedPlan);

  return {
    pathPoints,
    labelPosition: getLabelPosition(layoutEdge, pathPoints, context),
  };
}

function getDefaultRoutingPlan(direction: DiagramModel["direction"]): EdgeRoutingPlan {
  return {
    mode: "forward",
    startSide: direction === "LR" ? "right" : "bottom",
    endSide: direction === "LR" ? "left" : "top",
    lane: 0,
  };
}

function logEdgeAnchorDebug(
  edge: DiagramEdge,
  from: NodeBox,
  to: NodeBox,
  pathPoints: Point[],
  context: EdgeRenderContext,
  routingPlan: EdgeRoutingPlan,
): void {
  if (!debugEdgeAnchors) {
    return;
  }

  console.log("[Mermaid edge anchors]", {
    edge: `${edge.from} -> ${edge.to}`,
    firstPoint: pathPoints[0],
    from,
    intersections: getIntersectedNodeIds(edge, pathPoints, context),
    lastPoint: pathPoints[pathPoints.length - 1],
    mode: routingPlan.mode,
    pathBounds: getPathBounds(pathPoints),
    routePoints: pathPoints,
    source: "fallback-router",
    to,
  });
}

function logCollapsedReturnDebug(
  collapsedGroup: CollapsedReturnGroup,
  pathPoints: Point[],
  context: EdgeRenderContext,
): void {
  if (!debugEdgeAnchors) {
    return;
  }

  console.log("[Mermaid collapsed return]", {
    edgeIds: collapsedGroup.edgeIds,
    intersections: getIntersectedCollapsedNodeIds(collapsedGroup, pathPoints, context),
    pathBounds: getPathBounds(pathPoints),
    routePoints: pathPoints,
    source: "collapsed-return",
    sourceIds: collapsedGroup.sourceIds,
    targetId: collapsedGroup.targetId,
  });
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

function getRoutableEndpointBoxes(context: EdgeRenderContext): Map<string, NodeBox> {
  const endpointIds = new Set<string>();

  for (const edge of context.diagram.edges) {
    endpointIds.add(edge.from);
    endpointIds.add(edge.to);
  }

  const boxes = new Map<string, NodeBox>();

  for (const id of endpointIds) {
    const box = getNodeBox(id, context);

    if (box) {
      boxes.set(id, box);
    }
  }

  return boxes;
}

function getCollapsedReturnLabel(
  collapsedGroup: CollapsedReturnGroup,
  diagram: DiagramModel,
): string {
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const targetLabel = getShortPlainLabel(
    nodeById.get(collapsedGroup.targetId)?.label ?? collapsedGroup.targetId,
  );
  const sourceLabels = collapsedGroup.sourceIds.map((sourceId) =>
    getShortPlainLabel(nodeById.get(sourceId)?.label ?? sourceId),
  );
  const visibleSourceLabels = sourceLabels.slice(0, 3);
  const extraCount = sourceLabels.length - visibleSourceLabels.length;
  const sourceText =
    extraCount > 0
      ? `${visibleSourceLabels.join(", ")} +${extraCount} more`
      : visibleSourceLabels.join(", ");

  return `Returns ${sourceText} to ${targetLabel}`;
}

function getShortPlainLabel(label: string): string {
  const text = renderMermaidLabelText(label)
    .text.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  return text.length > 44 ? `${text.slice(0, 41).trim()}...` : text;
}

function getIntersectedCollapsedNodeIds(
  collapsedGroup: CollapsedReturnGroup,
  pathPoints: Point[],
  context: EdgeRenderContext,
): string[] {
  const ignoredIds = new Set([...collapsedGroup.sourceIds, collapsedGroup.targetId]);

  return context.layout.nodes
    .filter((node) => !ignoredIds.has(node.id))
    .filter((node) => {
      const box = toRootNodeBox(node, context);

      return pathIntersectsNodeBox(pathPoints, box);
    })
    .map((node) => node.id);
}

function getAllRoutingBoundsBoxes(
  context: EdgeRenderContext,
  endpointBoxes: Map<string, NodeBox>,
): NodeBox[] {
  const boxes = [...endpointBoxes.values()];

  for (const node of context.diagram.nodes) {
    if (endpointBoxes.has(node.id)) {
      continue;
    }

    const box = getNodeBox(node.id, context);

    if (box) {
      boxes.push(box);
    }
  }

  for (const subgraph of context.layout.subgraphs) {
    boxes.push({
      id: subgraph.id,
      shape: "rectangle",
      x: subgraph.x - context.originX,
      y: subgraph.y - context.originY,
      width: subgraph.width,
      height:
        subgraph.height + (context.subgraphTitleHeights.get(subgraph.id) ?? subgraphTitleHeight),
    });
  }

  return boxes;
}

function getNodeBox(id: string, context: EdgeRenderContext): NodeBox | null {
  const layoutNode = context.layout.nodes.find((node) => node.id === id);
  const diagramNode = context.diagram.nodes.find((node) => node.id === id);

  if (layoutNode && diagramNode) {
    const visibleSubgraphId = getVisibleAncestorSubgraphId(context.diagram, diagramNode.subgraphId);
    return getVisualNodeBox({
      diagramNode,
      layoutNode,
      originX: context.originX,
      originY: context.originY,
      parentTitleHeight: visibleSubgraphId
        ? (context.subgraphTitleHeights.get(visibleSubgraphId) ?? subgraphTitleHeight)
        : 0,
    });
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

export function getVisualNodeBox(input: VisualNodeBoxInput): NodeBox {
  return {
    id: input.diagramNode.id,
    shape: input.diagramNode.shape,
    x: input.layoutNode.x - input.originX,
    y: input.layoutNode.y - input.originY + (input.parentTitleHeight ?? 0),
    width: input.layoutNode.width,
    height: input.layoutNode.height,
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

function getPathBounds(pathPoints: Point[]): {
  height: number;
  width: number;
  x: number;
  y: number;
} {
  if (pathPoints.length === 0) {
    return { height: 0, width: 0, x: 0, y: 0 };
  }

  const minX = Math.min(...pathPoints.map((point) => point.x));
  const minY = Math.min(...pathPoints.map((point) => point.y));
  const maxX = Math.max(...pathPoints.map((point) => point.x));
  const maxY = Math.max(...pathPoints.map((point) => point.y));

  return {
    height: round(maxY - minY),
    width: round(maxX - minX),
    x: round(minX),
    y: round(minY),
  };
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

function getIntersectedNodeIds(
  edge: DiagramEdge,
  pathPoints: Point[],
  context: EdgeRenderContext,
): string[] {
  return context.layout.nodes
    .filter((node) => node.id !== edge.from && node.id !== edge.to)
    .filter((node) => {
      const box = toRootNodeBox(node, context);

      return pathIntersectsBox(pathPoints, box);
    })
    .map((node) => node.id);
}

function pathIntersectsBox(points: Point[], box: NodeBox): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (segmentIntersectsBox(points[index], points[index + 1], box)) {
      return true;
    }
  }

  return false;
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

function toRootNodeBox(node: DiagramLayoutNode, context: EdgeRenderContext): NodeBox {
  const diagramNode = context.diagram.nodes.find((entry) => entry.id === node.id);
  const visibleSubgraphId = getVisibleAncestorSubgraphId(context.diagram, diagramNode?.subgraphId);

  return {
    id: node.id,
    shape: diagramNode?.shape ?? "rectangle",
    x: node.x - context.originX,
    y:
      node.y -
      context.originY +
      (visibleSubgraphId
        ? (context.subgraphTitleHeights.get(visibleSubgraphId) ?? subgraphTitleHeight)
        : 0),
    width: node.width,
    height: node.height,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
