import type {
  DiagramLayoutNode,
  DiagramLayoutResult,
  DiagramModel,
  DiagramNode,
  NodeShape,
} from "../core";
import { estimateMultilineTextBox } from "./label-text";
import { setDiagramRootMetadata, setNodeMetadata, setSubgraphMetadata } from "./metadata";
import { renderEdges } from "./render-edges";
import type { RenderPlacement } from "./rerender";
import { resolveNodeStyle, type ResolvedNodeStyle } from "./styles";
import { getVisibleAncestorSubgraphId, isLayoutHelperSubgraph } from "./subgraph-visibility";
import { applyMermaidLabelToTextNode } from "./text-formatting";

type RenderBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type RenderContext = {
  diagram: DiagramModel;
  instanceId: string;
  layout: DiagramLayoutResult;
  rootFrame: FrameNode;
  originX: number;
  originY: number;
  settings: RenderSettings;
  boldFontName: FontName;
  subgraphFrames: Map<string, FrameNode>;
  subgraphTitleHeights: Map<string, number>;
};

export type LayoutTarget = "auto" | "slide-16-9" | "freeform";
export type FitStrength = "balanced" | "compact" | "strict";

export type PresentationLayoutSettings = {
  layoutTarget: LayoutTarget;
  fitStrength: FitStrength;
  targetCanvasWidth: number;
  targetCanvasHeight: number;
  slideSafeMargin: number;
  targetAspectRatio: number;
  minReadableTextSize: number;
};

export type RenderSettings = {
  fontName: FontName;
  fontSize: number;
  strokeWidth: number;
  cornerRadius: number;
  lineCornerRadius: number;
};

const rootPadding = 48;
const subgraphTitleHeight = 28;
const visibleSubgraphGap = 28;
const maxBoxLikeNodeTextWidth = 220;
const debugRenderGeometry = false;
export const defaultRenderSettings: RenderSettings = {
  fontName: { family: "FK Grotesk Neue Trial", style: "Regular" },
  fontSize: 13,
  strokeWidth: 1,
  cornerRadius: 20,
  lineCornerRadius: 12,
};
export const defaultPresentationLayoutSettings: PresentationLayoutSettings = {
  fitStrength: "balanced",
  layoutTarget: "auto",
  minReadableTextSize: 8,
  slideSafeMargin: 80,
  targetAspectRatio: 16 / 9,
  targetCanvasHeight: 1080,
  targetCanvasWidth: 1920,
};
const rootFill: SolidPaint = { type: "SOLID", color: { r: 0.96, g: 0.97, b: 0.98 } };
const subgraphFill: SolidPaint = {
  type: "SOLID",
  color: { r: 0.93, g: 0.96, b: 1 },
  opacity: 0.45,
};
const subgraphStroke: SolidPaint = { type: "SOLID", color: { r: 0.46, g: 0.58, b: 0.72 } };
const textFill: SolidPaint = { type: "SOLID", color: { r: 0.1, g: 0.11, b: 0.13 } };

export async function renderNativeNodes(
  diagram: DiagramModel,
  layout: DiagramLayoutResult,
  options: {
    instanceId: string;
    layoutSettings?: Partial<PresentationLayoutSettings>;
    placement?: RenderPlacement;
    settings?: Partial<RenderSettings>;
  },
): Promise<FrameNode> {
  const settings = resolveRenderSettings(options.settings);
  const layoutSettings = resolvePresentationLayoutSettings(options.layoutSettings);
  await loadRequestedFont(settings.fontName);
  const boldFontName = await loadBoldFontName(diagram, settings.fontName);

  const subgraphTitleHeights = getSubgraphTitleHeights(diagram, settings);
  const adjustedLayout = addVisibleSubgraphSpacing(
    diagram,
    layout,
    subgraphTitleHeights,
    layoutSettings,
  );
  const bounds = getRenderBounds(adjustedLayout, subgraphTitleHeights);
  const rootFrame = createRootFrame(diagram, bounds, options.placement);
  setDiagramRootMetadata(rootFrame, diagram, options.instanceId);
  const context: RenderContext = {
    diagram,
    instanceId: options.instanceId,
    layout: adjustedLayout,
    rootFrame,
    originX: bounds.minX - rootPadding,
    originY: bounds.minY - rootPadding,
    settings,
    boldFontName,
    subgraphFrames: new Map(),
    subgraphTitleHeights,
  };

  renderSubgraphs(context);
  renderEdges(context);
  renderNodes(context);

  insertRootFrame(rootFrame, options.placement);
  figma.viewport.scrollAndZoomIntoView([rootFrame]);

  return rootFrame;
}

export function addVisibleSubgraphSpacingForTest(
  diagram: DiagramModel,
  layout: DiagramLayoutResult,
  subgraphTitleHeights: Map<string, number>,
  layoutSettings: Partial<PresentationLayoutSettings> = {},
): DiagramLayoutResult {
  return addVisibleSubgraphSpacing(
    diagram,
    layout,
    subgraphTitleHeights,
    resolvePresentationLayoutSettings(layoutSettings),
  );
}

function addVisibleSubgraphSpacing(
  diagram: DiagramModel,
  layout: DiagramLayoutResult,
  subgraphTitleHeights: Map<string, number>,
  layoutSettings: PresentationLayoutSettings,
): DiagramLayoutResult {
  const layoutSubgraphById = new Map(layout.subgraphs.map((subgraph) => [subgraph.id, subgraph]));
  const topLevelVisibleSubgraphs = diagram.subgraphs
    .filter((subgraph) => !subgraph.parentId && !isLayoutHelperSubgraph(subgraph))
    .map((subgraph) => {
      const layoutSubgraph = layoutSubgraphById.get(subgraph.id);

      return layoutSubgraph
        ? {
            id: subgraph.id,
            height:
              layoutSubgraph.height +
              (subgraphTitleHeights.get(subgraph.id) ?? subgraphTitleHeight),
            width: layoutSubgraph.width,
            x: layoutSubgraph.x,
            y: layoutSubgraph.y,
          }
        : null;
    })
    .filter((entry): entry is { id: string; height: number; width: number; x: number; y: number } =>
      Boolean(entry),
    );

  if (topLevelVisibleSubgraphs.length < 2) {
    return layout;
  }

  const shiftBySubgraphId = new Map<string, { x: number; y: number }>();
  const baseX = Math.min(...topLevelVisibleSubgraphs.map((subgraph) => subgraph.x));
  const baseY = Math.min(...topLevelVisibleSubgraphs.map((subgraph) => subgraph.y));
  let cursorX = baseX;
  let cursorY = baseY;
  const packDirection = getVisibleTopLevelSubgraphPackDirection(
    diagram,
    topLevelVisibleSubgraphs.length,
    layoutSettings,
  );

  for (const subgraph of topLevelVisibleSubgraphs) {
    const targetX = packDirection === "horizontal" ? cursorX : baseX;
    const targetY = packDirection === "horizontal" ? baseY : cursorY;

    shiftBySubgraphId.set(subgraph.id, {
      x: targetX - subgraph.x,
      y: targetY - subgraph.y,
    });

    if (packDirection === "horizontal") {
      cursorX += subgraph.width + visibleSubgraphGap;
    } else {
      cursorY += subgraph.height + visibleSubgraphGap;
    }
  }

  if ([...shiftBySubgraphId.values()].every((shift) => shift.x === 0 && shift.y === 0)) {
    return layout;
  }

  const subgraphById = new Map(diagram.subgraphs.map((subgraph) => [subgraph.id, subgraph]));

  const getSubgraphShift = (subgraphId: string | undefined): { x: number; y: number } => {
    let currentId = subgraphId;

    while (currentId) {
      const shift = shiftBySubgraphId.get(currentId);

      if (shift !== undefined) {
        return shift;
      }

      currentId = subgraphById.get(currentId)?.parentId;
    }

    return { x: 0, y: 0 };
  };

  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(diagram.edges.map((edge) => [edge.id, edge]));

  return {
    nodes: layout.nodes.map((node) => {
      const shift = getSubgraphShift(nodeById.get(node.id)?.subgraphId);

      return {
        ...node,
        x: node.x + shift.x,
        y: node.y + shift.y,
      };
    }),
    edges: layout.edges.map((edge) => {
      const sourceEdge = edgeById.get(edge.id);
      const shift = getSubgraphShift(sourceEdge?.subgraphId);

      return {
        ...edge,
        points: edge.points.map((point) => ({
          ...point,
          x: point.x + shift.x,
          y: point.y + shift.y,
        })),
        labelPosition: edge.labelPosition
          ? {
              ...edge.labelPosition,
              x: edge.labelPosition.x + shift.x,
              y: edge.labelPosition.y + shift.y,
            }
          : undefined,
      };
    }),
    subgraphs: layout.subgraphs.map((subgraph) => {
      const shift = getSubgraphShift(subgraph.id);

      return {
        ...subgraph,
        x: subgraph.x + shift.x,
        y: subgraph.y + shift.y,
      };
    }),
  };
}

function getVisibleTopLevelSubgraphPackDirection(
  diagram: DiagramModel,
  visibleTopLevelSubgraphCount: number,
  layoutSettings: PresentationLayoutSettings,
): "horizontal" | "vertical" {
  if (diagram.direction === "LR") {
    return "horizontal";
  }

  if (layoutSettings.layoutTarget === "freeform") {
    return "vertical";
  }

  if (layoutSettings.layoutTarget === "slide-16-9" && visibleTopLevelSubgraphCount > 1) {
    return "horizontal";
  }

  if (
    layoutSettings.layoutTarget === "auto" &&
    visibleTopLevelSubgraphCount > 1 &&
    hasComparableTopLevelSubgraphs(diagram)
  ) {
    return "horizontal";
  }

  return "vertical";
}

function hasComparableTopLevelSubgraphs(diagram: DiagramModel): boolean {
  const topLevelVisibleSubgraphs = diagram.subgraphs.filter(
    (subgraph) => !subgraph.parentId && !isLayoutHelperSubgraph(subgraph),
  );

  if (topLevelVisibleSubgraphs.length < 2) {
    return false;
  }

  const signatures = topLevelVisibleSubgraphs.map((subgraph) =>
    diagram.subgraphs
      .filter((entry) => entry.parentId === subgraph.id && isLayoutHelperSubgraph(entry))
      .map((entry) => entry.nodeIds.length)
      .join(","),
  );
  const firstSignature = signatures[0];

  return firstSignature.length > 0 && signatures.every((signature) => signature === firstSignature);
}

async function loadRequestedFont(fontName: FontName): Promise<void> {
  try {
    await figma.loadFontAsync(fontName);
  } catch {
    throw new Error(
      `Selected font "${fontName.family}" with style "${fontName.style}" is not available in this file.`,
    );
  }
}

function createRootFrame(
  diagram: DiagramModel,
  bounds: RenderBounds,
  placement: RenderPlacement | undefined,
): FrameNode {
  const frame = figma.createFrame();
  frame.name = `Mermaid Diagram / ${diagram.id}`;
  frame.fills = [rootFill];
  frame.strokes = [];
  frame.clipsContent = false;
  frame.x =
    placement?.x ?? figma.viewport.center.x - (bounds.maxX - bounds.minX + rootPadding * 2) / 2;
  frame.y =
    placement?.y ?? figma.viewport.center.y - (bounds.maxY - bounds.minY + rootPadding * 2) / 2;
  frame.resizeWithoutConstraints(
    Math.max(1, bounds.maxX - bounds.minX + rootPadding * 2),
    Math.max(1, bounds.maxY - bounds.minY + rootPadding * 2),
  );
  return frame;
}

function insertRootFrame(rootFrame: FrameNode, placement: RenderPlacement | undefined): void {
  if (placement?.pageIndex !== undefined && placement.pageIndex >= 0) {
    figma.currentPage.insertChild(placement.pageIndex, rootFrame);
    return;
  }

  figma.currentPage.appendChild(rootFrame);
}

function renderSubgraphs(context: RenderContext): void {
  const sortedSubgraphs = [...context.diagram.subgraphs].sort((a, b) => {
    const aLayout = getLayoutSubgraph(a.id, context.layout);
    const bLayout = getLayoutSubgraph(b.id, context.layout);
    return area(bLayout) - area(aLayout);
  });

  for (const subgraph of sortedSubgraphs) {
    const isLayoutHelper = isLayoutHelperSubgraph(subgraph);
    logSubgraphVisibilityDebug(subgraph.id, isLayoutHelper ? "layout-only" : "visible");

    if (isLayoutHelper) {
      continue;
    }

    const layoutSubgraph = getLayoutSubgraph(subgraph.id, context.layout);
    const style = resolveSubgraphStyle(
      context.diagram,
      subgraph.classIds,
      context.settings.strokeWidth,
    );
    const frame = figma.createFrame();
    frame.name = `Subgraph / ${subgraph.label || subgraph.sourceId}`;
    setSubgraphMetadata(frame, subgraph, context.instanceId);
    frame.fills = [style.fill ?? subgraphFill];
    frame.strokes = [style.stroke ?? subgraphStroke];
    frame.strokeWeight = style.strokeWeight ?? context.settings.strokeWidth;
    frame.cornerRadius = context.settings.cornerRadius;
    frame.clipsContent = false;
    frame.x = layoutSubgraph.x - context.originX;
    frame.y = layoutSubgraph.y - context.originY;
    const titleHeight = getSubgraphTitleHeight(subgraph.id, context);
    frame.resizeWithoutConstraints(layoutSubgraph.width, layoutSubgraph.height + titleHeight);

    const title = createTextLayer("Subgraph Title", subgraph.label, context);
    const titleBox = estimateMultilineTextBox(subgraph.label, {
      fontSize: context.settings.fontSize,
      horizontalPadding: 0,
      minHeight: 18,
      minWidth: Math.max(1, layoutSubgraph.width - 24),
      verticalPadding: 0,
    });
    title.x = 12;
    title.y = 8;
    title.resizeWithoutConstraints(Math.max(1, layoutSubgraph.width - 24), titleBox.height);
    frame.appendChild(title);

    context.rootFrame.appendChild(frame);
    context.subgraphFrames.set(subgraph.id, frame);
  }
}

function resolveSubgraphStyle(
  diagram: DiagramModel,
  classIds: string[],
  defaultStrokeWeight: number,
): {
  fill?: SolidPaint;
  stroke?: SolidPaint;
  strokeWeight?: number;
} {
  const stylesById = new Map(diagram.styles.map((style) => [style.id, style]));
  const resolved: {
    fill?: SolidPaint;
    stroke?: SolidPaint;
    strokeWeight?: number;
  } = {};

  for (const classId of classIds) {
    const style = stylesById.get(classId);

    if (!style) {
      continue;
    }

    const normalizedProperties = Object.fromEntries(
      Object.entries(style.properties).map(([key, value]) => [
        key.trim().toLowerCase(),
        value.trim(),
      ]),
    );
    const fill = parseStyleColor(normalizedProperties.fill);
    const stroke = parseStyleColor(normalizedProperties.stroke);
    const strokeWeight = parseStyleStrokeWeight(
      normalizedProperties["stroke-width"] ?? normalizedProperties.strokewidth,
    );

    if (fill) {
      resolved.fill = fill;
    }

    if (stroke) {
      resolved.stroke = stroke;
    }

    if (strokeWeight !== null) {
      resolved.strokeWeight = strokeWeight;
    }
  }

  return {
    ...resolved,
    strokeWeight: resolved.strokeWeight ?? defaultStrokeWeight,
  };
}

function parseStyleColor(value: string | undefined): SolidPaint | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "transparent") {
    return {
      type: "SOLID",
      color: { r: 0, g: 0, b: 0 },
      opacity: 0,
    };
  }

  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (!hex) {
    return null;
  }

  const expanded =
    hex[1].length === 3
      ? hex[1]
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : hex[1];

  return {
    type: "SOLID",
    color: {
      r: Number.parseInt(expanded.slice(0, 2), 16) / 255,
      g: Number.parseInt(expanded.slice(2, 4), 16) / 255,
      b: Number.parseInt(expanded.slice(4, 6), 16) / 255,
    },
  };
}

function parseStyleStrokeWeight(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value.trim().replace(/px$/i, ""));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function renderNodes(context: RenderContext): void {
  for (const node of context.diagram.nodes) {
    const layoutNode = getLayoutNode(node.id, context.layout);
    const visibleSubgraphId = getVisibleAncestorSubgraphId(context.diagram, node.subgraphId);
    const parent = visibleSubgraphId
      ? context.subgraphFrames.get(visibleSubgraphId)
      : context.rootFrame;

    if (!parent) {
      createNodeGroup(
        node,
        layoutNode,
        context.rootFrame,
        getRootNodePosition(layoutNode, context),
        context,
      );
      continue;
    }

    if (parent === context.rootFrame) {
      createNodeGroup(node, layoutNode, parent, getRootNodePosition(layoutNode, context), context);
      continue;
    }

    const subgraphLayout = getLayoutSubgraph(visibleSubgraphId ?? "", context.layout);
    createNodeGroup(
      node,
      layoutNode,
      parent,
      {
        x: layoutNode.x - subgraphLayout.x,
        y:
          layoutNode.y -
          subgraphLayout.y +
          getSubgraphTitleHeight(visibleSubgraphId ?? "", context),
      },
      context,
    );
  }
}

function createNodeGroup(
  node: DiagramNode,
  layoutNode: DiagramLayoutNode,
  parent: FrameNode,
  position: { x: number; y: number },
  context: RenderContext,
): GroupNode {
  const style = resolveNodeStyle(context.diagram, node, {
    strokeWeight: context.settings.strokeWidth,
  });
  const shape = createNodeShape(node.shape, layoutNode, style, context.settings);
  shape.x = position.x;
  shape.y = position.y;
  parent.appendChild(shape);

  const label = createTextLayer("Node Label", node.label, context, {
    maxTextWidth: isBoxLikeShape(node.shape) ? maxBoxLikeNodeTextWidth : undefined,
  });
  label.textAlignHorizontal = "CENTER";
  label.textAlignVertical = "CENTER";
  label.fills = [style.textFill];
  label.x = position.x + 8;
  label.y = position.y;
  label.resizeWithoutConstraints(Math.max(1, layoutNode.width - 16), layoutNode.height);
  parent.appendChild(label);

  const group = figma.group([shape, label], parent);
  group.name = `Node / ${node.id}`;
  setNodeMetadata(group, node, context.instanceId);
  return group;
}

function createNodeShape(
  shape: NodeShape,
  layoutNode: DiagramLayoutNode,
  style: ResolvedNodeStyle,
  settings: RenderSettings,
): SceneNode {
  const nodeShape = createRawShape(shape, layoutNode);
  nodeShape.name = "Node Shape";
  nodeShape.fills = [style.fill];
  nodeShape.strokes = [style.stroke];
  nodeShape.strokeWeight = style.strokeWeight;
  nodeShape.x = 0;
  nodeShape.y = 0;
  nodeShape.resizeWithoutConstraints(layoutNode.width, layoutNode.height);

  if ("cornerRadius" in nodeShape) {
    nodeShape.cornerRadius = getCornerRadius(shape, layoutNode, settings.cornerRadius);
  }

  return nodeShape;
}

function createRawShape(
  shape: NodeShape,
  layoutNode: DiagramLayoutNode,
): RectangleNode | EllipseNode | PolygonNode | VectorNode {
  if (shape === "circle") {
    return figma.createEllipse();
  }

  if (shape === "diamond") {
    const polygon = figma.createPolygon();
    polygon.pointCount = 4;
    return polygon;
  }

  if (shape === "asymmetric") {
    const slant = Math.min(24, layoutNode.width * 0.2);
    const vector = figma.createVector();
    vector.vectorPaths = [
      {
        windingRule: "NONZERO",
        data: `M ${slant} 0 L ${layoutNode.width} 0 L ${layoutNode.width - slant} ${layoutNode.height} L 0 ${layoutNode.height} Z`,
      },
    ];
    return vector;
  }

  return figma.createRectangle();
}

function getCornerRadius(
  shape: NodeShape,
  layoutNode: DiagramLayoutNode,
  cornerRadius: number,
): number {
  if (shape === "rounded") {
    return cornerRadius;
  }

  if (shape === "stadium") {
    return layoutNode.height / 2;
  }

  if (shape === "rectangle") {
    return cornerRadius;
  }

  return 0;
}

function createTextLayer(
  name: string,
  characters: string,
  context: RenderContext,
  options: {
    maxTextWidth?: number;
  } = {},
): TextNode {
  const text = figma.createText();
  text.name = name;
  text.fontName = context.settings.fontName;
  text.fontSize = context.settings.fontSize;
  text.fills = [textFill];
  applyMermaidLabelToTextNode(text, characters, {
    baseFontName: context.settings.fontName,
    boldFontName: context.boldFontName,
    fontSize: context.settings.fontSize,
    maxWidth: options.maxTextWidth,
  });
  return text;
}

function resolveRenderSettings(settings: Partial<RenderSettings> | undefined): RenderSettings {
  return {
    fontName: settings?.fontName ?? defaultRenderSettings.fontName,
    fontSize: settings?.fontSize ?? defaultRenderSettings.fontSize,
    strokeWidth: settings?.strokeWidth ?? defaultRenderSettings.strokeWidth,
    cornerRadius: settings?.cornerRadius ?? defaultRenderSettings.cornerRadius,
    lineCornerRadius: settings?.lineCornerRadius ?? defaultRenderSettings.lineCornerRadius,
  };
}

function resolvePresentationLayoutSettings(
  settings: Partial<PresentationLayoutSettings> | undefined,
): PresentationLayoutSettings {
  return {
    fitStrength: isFitStrength(settings?.fitStrength)
      ? settings.fitStrength
      : defaultPresentationLayoutSettings.fitStrength,
    layoutTarget: isLayoutTarget(settings?.layoutTarget)
      ? settings.layoutTarget
      : defaultPresentationLayoutSettings.layoutTarget,
    minReadableTextSize: clampLocalNumber(
      settings?.minReadableTextSize,
      defaultPresentationLayoutSettings.minReadableTextSize,
      8,
      24,
    ),
    slideSafeMargin: clampLocalNumber(
      settings?.slideSafeMargin,
      defaultPresentationLayoutSettings.slideSafeMargin,
      0,
      400,
    ),
    targetAspectRatio: clampLocalNumber(
      settings?.targetAspectRatio,
      defaultPresentationLayoutSettings.targetAspectRatio,
      0.5,
      4,
    ),
    targetCanvasHeight: clampLocalNumber(
      settings?.targetCanvasHeight,
      defaultPresentationLayoutSettings.targetCanvasHeight,
      240,
      10000,
    ),
    targetCanvasWidth: clampLocalNumber(
      settings?.targetCanvasWidth,
      defaultPresentationLayoutSettings.targetCanvasWidth,
      320,
      10000,
    ),
  };
}

function isLayoutTarget(value: unknown): value is LayoutTarget {
  return value === "auto" || value === "slide-16-9" || value === "freeform";
}

function isFitStrength(value: unknown): value is FitStrength {
  return value === "balanced" || value === "compact" || value === "strict";
}

function clampLocalNumber(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function getSubgraphTitleHeights(
  diagram: DiagramModel,
  settings: RenderSettings,
): Map<string, number> {
  return new Map(
    diagram.subgraphs.map((subgraph) => [
      subgraph.id,
      isLayoutHelperSubgraph(subgraph)
        ? 0
        : getSubgraphTitleHeightForLabel(subgraph.label, settings),
    ]),
  );
}

function getSubgraphTitleHeight(id: string, context: RenderContext): number {
  return context.subgraphTitleHeights.get(id) ?? subgraphTitleHeight;
}

function getSubgraphTitleHeightForLabel(label: string, settings: RenderSettings): number {
  if (label.trim().length === 0) {
    return 0;
  }

  const titleBox = estimateMultilineTextBox(label, {
    fontSize: settings.fontSize,
    horizontalPadding: 0,
    minHeight: 18,
    minWidth: 1,
    verticalPadding: 0,
  });

  return Math.max(subgraphTitleHeight, 10 + titleBox.height);
}

function logSubgraphVisibilityDebug(id: string, visibility: "layout-only" | "visible"): void {
  if (!debugRenderGeometry) {
    return;
  }

  console.log("[Mermaid subgraph render]", {
    id,
    visibility,
  });
}

async function loadBoldFontName(diagram: DiagramModel, fontName: FontName): Promise<FontName> {
  const boldFontName = resolveBoldFontName(fontName);

  if (!diagramUsesBoldMarkup(diagram) || isSameFontName(fontName, boldFontName)) {
    return fontName;
  }

  try {
    await figma.loadFontAsync(boldFontName);
    return boldFontName;
  } catch {
    return fontName;
  }
}

function resolveBoldFontName(fontName: FontName): FontName {
  return /bold/i.test(fontName.style)
    ? fontName
    : {
        family: fontName.family,
        style: "Bold",
      };
}

function isSameFontName(left: FontName, right: FontName): boolean {
  return left.family === right.family && left.style === right.style;
}

function diagramUsesBoldMarkup(diagram: DiagramModel): boolean {
  return (
    diagram.nodes.some((node) => /<b>/i.test(node.label)) ||
    diagram.subgraphs.some((subgraph) => /<b>/i.test(subgraph.label)) ||
    diagram.edges.some((edge) => edge.label && /<b>/i.test(edge.label))
  );
}

function isBoxLikeShape(shape: NodeShape): boolean {
  return (
    shape === "rectangle" || shape === "rounded" || shape === "stadium" || shape === "asymmetric"
  );
}

function getRootNodePosition(
  layoutNode: DiagramLayoutNode,
  context: RenderContext,
): { x: number; y: number } {
  return {
    x: layoutNode.x - context.originX,
    y: layoutNode.y - context.originY,
  };
}

function getRenderBounds(
  layout: DiagramLayoutResult,
  subgraphTitleHeights: Map<string, number>,
): RenderBounds {
  const boxes = [
    ...layout.nodes.map((node) => ({
      minX: node.x,
      minY: node.y,
      maxX: node.x + node.width,
      maxY: node.y + node.height,
    })),
    ...layout.subgraphs.map((subgraph) => ({
      minX: subgraph.x,
      minY: subgraph.y,
      maxX: subgraph.x + subgraph.width,
      maxY:
        subgraph.y +
        subgraph.height +
        (subgraphTitleHeights.get(subgraph.id) ?? subgraphTitleHeight),
    })),
  ];

  if (boxes.length === 0) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }

  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    minY: Math.min(...boxes.map((box) => box.minY)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    maxY: Math.max(...boxes.map((box) => box.maxY)),
  };
}

function getLayoutNode(id: string, layout: DiagramLayoutResult): DiagramLayoutNode {
  const node = layout.nodes.find((entry) => entry.id === id);

  if (!node) {
    throw new Error(`Missing layout for node "${id}".`);
  }

  return node;
}

function getLayoutSubgraph(
  id: string,
  layout: DiagramLayoutResult,
): DiagramLayoutResult["subgraphs"][number] {
  const subgraph = layout.subgraphs.find((entry) => entry.id === id);

  if (!subgraph) {
    throw new Error(`Missing layout for subgraph "${id}".`);
  }

  return subgraph;
}

function area(subgraph: DiagramLayoutResult["subgraphs"][number]): number {
  return subgraph.width * subgraph.height;
}
