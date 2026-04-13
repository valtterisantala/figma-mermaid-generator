import type {
  DiagramLayoutNode,
  DiagramLayoutResult,
  DiagramModel,
  DiagramNode,
  NodeShape,
} from "../core";
import { setDiagramRootMetadata, setNodeMetadata, setSubgraphMetadata } from "./metadata";
import { renderEdges } from "./render-edges";
import type { RenderPlacement } from "./rerender";

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
  subgraphFrames: Map<string, FrameNode>;
};

const rootPadding = 48;
const subgraphTitleHeight = 28;
const labelFont: FontName = { family: "Inter", style: "Regular" };
const rootFill: SolidPaint = { type: "SOLID", color: { r: 0.96, g: 0.97, b: 0.98 } };
const nodeFill: SolidPaint = { type: "SOLID", color: { r: 1, g: 1, b: 1 } };
const subgraphFill: SolidPaint = {
  type: "SOLID",
  color: { r: 0.93, g: 0.96, b: 1 },
  opacity: 0.45,
};
const nodeStroke: SolidPaint = { type: "SOLID", color: { r: 0.28, g: 0.32, b: 0.38 } };
const subgraphStroke: SolidPaint = { type: "SOLID", color: { r: 0.46, g: 0.58, b: 0.72 } };
const textFill: SolidPaint = { type: "SOLID", color: { r: 0.1, g: 0.11, b: 0.13 } };

export async function renderNativeNodes(
  diagram: DiagramModel,
  layout: DiagramLayoutResult,
  options: {
    instanceId: string;
    placement?: RenderPlacement;
  },
): Promise<FrameNode> {
  await figma.loadFontAsync(labelFont);

  const bounds = getRenderBounds(layout);
  const rootFrame = createRootFrame(diagram, bounds, options.placement);
  setDiagramRootMetadata(rootFrame, diagram, options.instanceId);
  const context: RenderContext = {
    diagram,
    instanceId: options.instanceId,
    layout,
    rootFrame,
    originX: bounds.minX - rootPadding,
    originY: bounds.minY - rootPadding,
    subgraphFrames: new Map(),
  };

  renderSubgraphs(context);
  renderEdges(context);
  renderNodes(context);

  insertRootFrame(rootFrame, options.placement);
  figma.viewport.scrollAndZoomIntoView([rootFrame]);

  return rootFrame;
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
    const layoutSubgraph = getLayoutSubgraph(subgraph.id, context.layout);
    const frame = figma.createFrame();
    frame.name = `Subgraph / ${subgraph.label}`;
    setSubgraphMetadata(frame, subgraph, context.instanceId);
    frame.fills = [subgraphFill];
    frame.strokes = [subgraphStroke];
    frame.strokeWeight = 1;
    frame.cornerRadius = 8;
    frame.clipsContent = false;
    frame.x = layoutSubgraph.x - context.originX;
    frame.y = layoutSubgraph.y - context.originY;
    frame.resizeWithoutConstraints(
      layoutSubgraph.width,
      layoutSubgraph.height + subgraphTitleHeight,
    );

    const title = createTextLayer("Subgraph Title", subgraph.label, 13);
    title.x = 12;
    title.y = 8;
    title.resizeWithoutConstraints(Math.max(1, layoutSubgraph.width - 24), 18);
    frame.appendChild(title);

    context.rootFrame.appendChild(frame);
    context.subgraphFrames.set(subgraph.id, frame);
  }
}

function renderNodes(context: RenderContext): void {
  for (const node of context.diagram.nodes) {
    const layoutNode = getLayoutNode(node.id, context.layout);
    const parent = node.subgraphId
      ? context.subgraphFrames.get(node.subgraphId)
      : context.rootFrame;

    if (!parent) {
      createNodeGroup(
        node,
        layoutNode,
        context.rootFrame,
        getRootNodePosition(layoutNode, context),
        context.instanceId,
      );
      continue;
    }

    if (parent === context.rootFrame) {
      createNodeGroup(
        node,
        layoutNode,
        parent,
        getRootNodePosition(layoutNode, context),
        context.instanceId,
      );
      continue;
    }

    const subgraphLayout = getLayoutSubgraph(node.subgraphId ?? "", context.layout);
    createNodeGroup(
      node,
      layoutNode,
      parent,
      {
        x: layoutNode.x - subgraphLayout.x,
        y: layoutNode.y - subgraphLayout.y + subgraphTitleHeight,
      },
      context.instanceId,
    );
  }
}

function createNodeGroup(
  node: DiagramNode,
  layoutNode: DiagramLayoutNode,
  parent: FrameNode,
  position: { x: number; y: number },
  instanceId: string,
): GroupNode {
  const shape = createNodeShape(node.shape, layoutNode);
  shape.x = position.x;
  shape.y = position.y;
  parent.appendChild(shape);

  const label = createTextLayer("Node Label", node.label, 13);
  label.textAlignHorizontal = "CENTER";
  label.textAlignVertical = "CENTER";
  label.x = position.x + 8;
  label.y = position.y;
  label.resizeWithoutConstraints(Math.max(1, layoutNode.width - 16), layoutNode.height);
  parent.appendChild(label);

  const group = figma.group([shape, label], parent);
  group.name = `Node / ${node.id}`;
  setNodeMetadata(group, node, instanceId);
  return group;
}

function createNodeShape(shape: NodeShape, layoutNode: DiagramLayoutNode): SceneNode {
  const nodeShape = createRawShape(shape, layoutNode);
  nodeShape.name = "Node Shape";
  nodeShape.fills = [nodeFill];
  nodeShape.strokes = [nodeStroke];
  nodeShape.strokeWeight = 1;
  nodeShape.x = 0;
  nodeShape.y = 0;
  nodeShape.resizeWithoutConstraints(layoutNode.width, layoutNode.height);

  if ("cornerRadius" in nodeShape) {
    nodeShape.cornerRadius = getCornerRadius(shape, layoutNode);
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

function getCornerRadius(shape: NodeShape, layoutNode: DiagramLayoutNode): number {
  if (shape === "rounded") {
    return 8;
  }

  if (shape === "stadium") {
    return layoutNode.height / 2;
  }

  return 0;
}

function createTextLayer(name: string, characters: string, fontSize: number): TextNode {
  const text = figma.createText();
  text.name = name;
  text.fontName = labelFont;
  text.fontSize = fontSize;
  text.fills = [textFill];
  text.characters = characters;
  return text;
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

function getRenderBounds(layout: DiagramLayoutResult): RenderBounds {
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
      maxY: subgraph.y + subgraph.height + subgraphTitleHeight,
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
