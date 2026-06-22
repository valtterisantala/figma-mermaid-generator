import type { DiagramEdge, DiagramModel } from "../core";
import type { PresentationLayoutSettings } from "./render";
import { getVisibleAncestorSubgraphId, isLayoutHelperSubgraph } from "./subgraph-visibility";

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TopLevelBlock = Bounds & {
  id: string;
  frame: FrameNode;
};

export type PackingBlock = Bounds & {
  id: string;
};

type Packing = {
  name: string;
  rows: number[];
};

export type FinalizeGeometryInput = {
  diagram: DiagramModel;
  rootFrame: FrameNode;
  nodeGroups: Map<string, GroupNode>;
  edgeGroups: Map<string, GroupNode>;
  edgeLabelGroups: Map<string, GroupNode>;
  subgraphFrames: Map<string, FrameNode>;
  layoutSettings: PresentationLayoutSettings;
};

const debugFinalization = false;
const subgraphPadding = 32;
const topLevelGroupGap = 64;
const anchorTolerance = 1.5;

export function finalizeGeometry(input: FinalizeGeometryInput): string[] {
  const warnings: string[] = [];

  recalculateSubgraphBounds(input);
  packTopLevelVisibleGroups(input);
  recalculateRootBounds(input.rootFrame);
  applyLayerOrdering(input);
  warnings.push(...validateFinalLayout(input));

  if (debugFinalization) {
    logFinalGeometry(input, warnings);
  }

  for (const warning of warnings) {
    console.warn(`[Mermaid finalization warning] ${warning}`);
  }

  return warnings;
}

function recalculateSubgraphBounds(input: FinalizeGeometryInput): void {
  const visibleSubgraphs = [...input.diagram.subgraphs]
    .filter((subgraph) => !isLayoutHelperSubgraph(subgraph))
    .sort((left, right) => getDepth(right.id, input.diagram) - getDepth(left.id, input.diagram));

  for (const subgraph of visibleSubgraphs) {
    const frame = input.subgraphFrames.get(subgraph.id);

    if (!frame) {
      continue;
    }

    const descendantBounds = getVisibleDescendantBounds(subgraph.id, input);

    if (!descendantBounds) {
      continue;
    }

    const local = toLocalBounds(descendantBounds, frame.parent);
    const size = getSubgraphContentFrameSize(getLocalBounds(frame), local);

    frame.resizeWithoutConstraints(size.width, size.height);
  }
}

export function getSubgraphContentFrameSizeForTest(
  frame: Bounds,
  content: Bounds,
): {
  height: number;
  width: number;
} {
  return getSubgraphContentFrameSize(frame, content);
}

function getSubgraphContentFrameSize(
  frame: Bounds,
  content: Bounds,
): {
  height: number;
  width: number;
} {
  const maxX = content.x + content.width + subgraphPadding;
  const maxY = content.y + content.height + subgraphPadding;

  return {
    width: round(Math.max(subgraphPadding * 2, maxX - frame.x)),
    height: round(Math.max(subgraphPadding * 2, maxY - frame.y)),
  };
}

function packTopLevelVisibleGroups(input: FinalizeGeometryInput): void {
  const blocks = getTopLevelVisibleBlocks(input);

  if (blocks.length < 2) {
    return;
  }

  if (shouldPreserveLrTopLevelSubgraphRow(input.diagram, blocks)) {
    return;
  }

  const hasCollision = hasTopLevelCollision(blocks);
  const shouldSlidePack = input.layoutSettings.layoutTarget === "slide-16-9";
  const shouldAutoPack =
    input.layoutSettings.layoutTarget === "auto" && isClearlyPoorPacking(blocks, input);
  const shouldUseLayeredPacking = input.layoutSettings.layoutType === "layered-architecture";

  if (shouldUseLayeredPacking && !hasCollision) {
    return;
  }

  if (shouldUseLayeredPacking) {
    const translations = applyLayeredArchitecturePacking(blocks, input.diagram);

    if (debugFinalization) {
      console.log("[Mermaid final layered packing]", {
        blocks: blocks.map((block) => ({
          final: getLocalBounds(block.frame),
          id: block.id,
          initial: { height: block.height, width: block.width, x: block.x, y: block.y },
          translation: translations.get(block.id) ?? { x: 0, y: 0 },
        })),
        collisionDetected: hasCollision,
      });
    }

    return;
  }

  if (!hasCollision && !shouldSlidePack && !shouldAutoPack) {
    return;
  }

  const packing =
    input.layoutSettings.layoutTarget === "freeform"
      ? getSourcePacking(input.diagram, blocks.length)
      : chooseBestPacking(blocks, input, getSourcePacking(input.diagram, blocks.length));
  const translations = applyPacking(blocks, packing);

  if (debugFinalization) {
    console.log("[Mermaid final packing]", {
      blocks: blocks.map((block) => ({
        final: getLocalBounds(block.frame),
        id: block.id,
        initial: { height: block.height, width: block.width, x: block.x, y: block.y },
        translation: translations.get(block.id) ?? { x: 0, y: 0 },
      })),
      collisionDetected: hasCollision,
      packing: packing.name,
    });
  }
}

function shouldPreserveLrTopLevelSubgraphRow(
  diagram: DiagramModel,
  blocks: TopLevelBlock[],
): boolean {
  if (diagram.direction !== "LR" || blocks.length < 2) {
    return false;
  }

  const topLevelIds = blocks.map((block) => block.id);
  const topLevelIdSet = new Set(topLevelIds);
  const nodeTopLevelSubgraphById = new Map<string, string>();

  for (const node of diagram.nodes) {
    const topLevelId = getTopLevelSubgraphId(node.subgraphId, diagram);

    if (topLevelId && topLevelIdSet.has(topLevelId)) {
      nodeTopLevelSubgraphById.set(node.id, topLevelId);
    }
  }

  const connectedPairs = new Set<string>();

  for (const edge of diagram.edges) {
    const fromTopLevelId = nodeTopLevelSubgraphById.get(edge.from);
    const toTopLevelId = nodeTopLevelSubgraphById.get(edge.to);

    if (!fromTopLevelId || !toTopLevelId || fromTopLevelId === toTopLevelId) {
      continue;
    }

    connectedPairs.add(`${fromTopLevelId}::${toTopLevelId}`);
  }

  return topLevelIds.slice(0, -1).every((id, index) => {
    const nextId = topLevelIds[index + 1];
    return connectedPairs.has(`${id}::${nextId}`);
  });
}

function getTopLevelSubgraphId(
  subgraphId: string | undefined,
  diagram: DiagramModel,
): string | undefined {
  if (!subgraphId) {
    return undefined;
  }

  const subgraphById = new Map(diagram.subgraphs.map((subgraph) => [subgraph.id, subgraph]));
  let currentId: string | undefined = subgraphId;
  let topLevelId: string | undefined;

  while (currentId) {
    topLevelId = currentId;
    currentId = subgraphById.get(currentId)?.parentId;
  }

  return topLevelId;
}

function applyLayeredArchitecturePacking(
  blocks: TopLevelBlock[],
  diagram: DiagramModel,
): Map<string, { x: number; y: number }> {
  const translations = new Map<string, { x: number; y: number }>();
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const originX = Math.min(...blocks.map((block) => block.x));
  const originY = Math.min(...blocks.map((block) => block.y));
  const positions = new Map<string, { x: number; y: number }>();
  let cursorX = originX;
  let mainRowHeight = 0;

  for (const id of ["Users", "Surfaces", "App"]) {
    const block = blockById.get(id);

    if (!block) {
      continue;
    }

    positions.set(id, { x: cursorX, y: originY });
    cursorX += block.width + topLevelGroupGap;
    mainRowHeight = Math.max(mainRowHeight, block.height);
  }

  const rightColumnX = cursorX;
  let rightColumnY = originY;

  for (const id of ["Services", "Packages"]) {
    const block = blockById.get(id);

    if (!block) {
      continue;
    }

    positions.set(id, { x: rightColumnX, y: rightColumnY });
    rightColumnY += block.height + topLevelGroupGap;
  }

  let overflowY = Math.max(originY + mainRowHeight, rightColumnY) + topLevelGroupGap;

  for (const subgraph of diagram.subgraphs.filter((subgraph) => !subgraph.parentId)) {
    const block = blockById.get(subgraph.id);

    if (!block || positions.has(block.id)) {
      continue;
    }

    positions.set(block.id, { x: originX, y: overflowY });
    overflowY += block.height + topLevelGroupGap;
  }

  for (const block of blocks) {
    const position = positions.get(block.id);

    if (!position) {
      continue;
    }

    const translation = {
      x: round(position.x - block.x),
      y: round(position.y - block.y),
    };
    block.frame.x = round(position.x);
    block.frame.y = round(position.y);
    translations.set(block.id, translation);
  }

  return translations;
}

function getTopLevelVisibleBlocks(input: FinalizeGeometryInput): TopLevelBlock[] {
  return input.diagram.subgraphs
    .filter((subgraph) => !subgraph.parentId && !isLayoutHelperSubgraph(subgraph))
    .map((subgraph) => {
      const frame = input.subgraphFrames.get(subgraph.id);

      return frame
        ? {
            ...getLocalBounds(frame),
            frame,
            id: subgraph.id,
          }
        : null;
    })
    .filter((block): block is TopLevelBlock => Boolean(block));
}

function hasTopLevelCollision(blocks: TopLevelBlock[]): boolean {
  for (let leftIndex = 0; leftIndex < blocks.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < blocks.length; rightIndex += 1) {
      if (boundsOverlapOrTooClose(blocks[leftIndex], blocks[rightIndex], topLevelGroupGap)) {
        return true;
      }
    }
  }

  return false;
}

function boundsOverlapOrTooClose(left: Bounds, right: Bounds, gap: number): boolean {
  return !(
    left.x + left.width + gap <= right.x ||
    right.x + right.width + gap <= left.x ||
    left.y + left.height + gap <= right.y ||
    right.y + right.height + gap <= left.y
  );
}

function getSourcePacking(diagram: DiagramModel, blockCount: number): Packing {
  if (diagram.direction === "LR") {
    return {
      name: "source-row",
      rows: Array.from({ length: blockCount }, () => 0),
    };
  }

  return {
    name: "source-stack",
    rows: Array.from({ length: blockCount }, (_value, index) => index),
  };
}

function chooseBestPacking(
  blocks: TopLevelBlock[],
  input: FinalizeGeometryInput,
  sourcePacking: Packing,
): Packing {
  const candidates = getPackingCandidates(blocks.length, sourcePacking);

  return candidates
    .map((packing) => ({
      packing,
      score: scorePacking(blocks, packing, input),
    }))
    .reduce((winner, candidate) => (candidate.score > winner.score ? candidate : winner)).packing;
}

function getPackingCandidates(blockCount: number, sourcePacking: Packing): Packing[] {
  const candidates: Packing[] = [
    sourcePacking,
    {
      name: "row",
      rows: Array.from({ length: blockCount }, () => 0),
    },
    {
      name: "stack",
      rows: Array.from({ length: blockCount }, (_value, index) => index),
    },
  ];

  if (blockCount === 3) {
    candidates.push({ name: "2+1", rows: [0, 0, 1] });
    candidates.push({ name: "1+2", rows: [0, 1, 1] });
  }

  if (blockCount === 4) {
    candidates.push({ name: "2x2", rows: [0, 0, 1, 1] });
  }

  return dedupePackings(candidates);
}

function dedupePackings(packings: Packing[]): Packing[] {
  const seen = new Set<string>();

  return packings.filter((packing) => {
    const key = packing.rows.join(",");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function scorePacking(
  blocks: PackingBlock[],
  packing: Packing,
  input: FinalizeGeometryInput,
): number {
  const bounds = measurePacking(blocks, packing);
  const safeWidth = Math.max(
    1,
    input.layoutSettings.targetCanvasWidth - input.layoutSettings.slideSafeMargin * 2,
  );
  const safeHeight = Math.max(
    1,
    input.layoutSettings.targetCanvasHeight - input.layoutSettings.slideSafeMargin * 2,
  );
  const aspectRatio = bounds.width / Math.max(1, bounds.height);
  const aspectPenalty =
    Math.abs(Math.log(aspectRatio / input.layoutSettings.targetAspectRatio)) * 120;
  const overflowX = Math.max(0, bounds.width - safeWidth) / safeWidth;
  const overflowY = Math.max(0, bounds.height - safeHeight) / safeHeight;
  const overflowWeight = input.layoutSettings.fitStrength === "strict" ? 900 : 550;
  const underusedHeightPenalty = bounds.height / safeHeight < 0.35 ? 80 : 0;
  const rowCount = Math.max(...packing.rows) + 1;
  const wideStripPenalty = blocks.length >= 3 && rowCount === 1 && aspectRatio > 2.2 ? 420 : 0;

  return (
    1000 -
    aspectPenalty -
    (overflowX + overflowY) * overflowWeight -
    underusedHeightPenalty -
    wideStripPenalty
  );
}

function isClearlyPoorPacking(blocks: PackingBlock[], input: FinalizeGeometryInput): boolean {
  const bounds = unionBounds(blocks);

  if (!bounds) {
    return false;
  }

  const safeHeight = Math.max(
    1,
    input.layoutSettings.targetCanvasHeight - input.layoutSettings.slideSafeMargin * 2,
  );
  const aspectRatio = bounds.width / Math.max(1, bounds.height);

  return blocks.length >= 3 && (aspectRatio > 2.6 || bounds.height / safeHeight < 0.35);
}

function applyPacking(
  blocks: TopLevelBlock[],
  packing: Packing,
): Map<string, { x: number; y: number }> {
  const translations = new Map<string, { x: number; y: number }>();
  const originX = Math.min(...blocks.map((block) => block.x));
  const originY = Math.min(...blocks.map((block) => block.y));
  const rows = getPackingRows(blocks, packing);
  let cursorY = originY;

  for (const row of rows) {
    let cursorX = originX;
    const rowHeight = Math.max(...row.map((block) => block.height));

    for (const block of row) {
      const translation = {
        x: round(cursorX - block.x),
        y: round(cursorY - block.y),
      };
      block.frame.x = round(cursorX);
      block.frame.y = round(cursorY);
      translations.set(block.id, translation);
      cursorX += block.width + topLevelGroupGap;
    }

    cursorY += rowHeight + topLevelGroupGap;
  }

  return translations;
}

export function choosePackingRowsForTest(
  blocks: PackingBlock[],
  settings: FinalizeGeometryInput["layoutSettings"],
  sourceRows: number[],
): number[] {
  return chooseBestPacking(
    blocks as TopLevelBlock[],
    {
      diagram: { direction: "LR" } as DiagramModel,
      layoutSettings: settings,
    } as FinalizeGeometryInput,
    { name: "source", rows: sourceRows },
  ).rows;
}

export function shouldSkipFinalPackingForTest(
  diagram: DiagramModel,
  blocks: PackingBlock[],
): boolean {
  return shouldPreserveLrTopLevelSubgraphRow(diagram, blocks as TopLevelBlock[]);
}

function measurePacking(
  blocks: PackingBlock[],
  packing: Packing,
): { width: number; height: number } {
  const rows = getPackingRows(blocks, packing);
  const rowWidths = rows.map((row) =>
    row.reduce(
      (width, block, index) => width + block.width + (index > 0 ? topLevelGroupGap : 0),
      0,
    ),
  );
  const rowHeights = rows.map((row) => Math.max(...row.map((block) => block.height)));

  return {
    height: rowHeights.reduce(
      (height, rowHeight, index) => height + rowHeight + (index > 0 ? topLevelGroupGap : 0),
      0,
    ),
    width: Math.max(...rowWidths),
  };
}

function getPackingRows<TBlock extends PackingBlock>(
  blocks: TBlock[],
  packing: Packing,
): TBlock[][] {
  const rowIndexes = [...new Set(packing.rows)].sort((left, right) => left - right);

  return rowIndexes.map((rowIndex) =>
    blocks.filter((_block, index) => packing.rows[index] === rowIndex),
  );
}

function recalculateRootBounds(rootFrame: FrameNode): void {
  const childBounds = unionBounds(rootFrame.children.map((child) => getLocalBounds(child)));

  if (!childBounds) {
    return;
  }

  const maxX = Math.max(rootFrame.width, childBounds.x + childBounds.width + subgraphPadding);
  const maxY = Math.max(rootFrame.height, childBounds.y + childBounds.height + subgraphPadding);

  rootFrame.resizeWithoutConstraints(round(maxX), round(maxY));
}

function getVisibleDescendantBounds(
  subgraphId: string,
  input: FinalizeGeometryInput,
): Bounds | null {
  const frame = input.subgraphFrames.get(subgraphId);
  const titleBounds =
    frame?.children
      .filter((child) => child.type === "TEXT" && child.name === "Subgraph Title")
      .map((child) => getAbsoluteBounds(child as SceneNode)) ?? [];
  const nodeBounds = input.diagram.nodes
    .filter((node) => getVisibleAncestorSubgraphId(input.diagram, node.subgraphId) === subgraphId)
    .map((node) => input.nodeGroups.get(node.id))
    .filter((node): node is GroupNode => Boolean(node))
    .map(getAbsoluteBounds);

  return unionBounds([...titleBounds, ...nodeBounds]);
}

function applyLayerOrdering(input: FinalizeGeometryInput): void {
  orderChildren(input.rootFrame, input);

  for (const frame of input.subgraphFrames.values()) {
    orderChildren(frame, input);
  }
}

function orderChildren(parent: BaseNode & ChildrenMixin, input: FinalizeGeometryInput): void {
  const children = [...parent.children] as SceneNode[];
  const subgraphs = children.filter(
    (child) => child.type === "FRAME" && isKnownChild(child, input.subgraphFrames),
  );
  const edgeGroups = children.filter(
    (child) => child.type === "GROUP" && isKnownChild(child, input.edgeGroups),
  );
  const nodeGroups = children.filter(
    (child) => child.type === "GROUP" && isKnownChild(child, input.nodeGroups),
  );
  const edgeLabelGroups = children.filter(
    (child) => child.type === "GROUP" && isKnownChild(child, input.edgeLabelGroups),
  );
  const subgraphTitles = children.filter(
    (child) => child.type === "TEXT" && child.name === "Subgraph Title",
  );

  for (const child of [
    ...subgraphs,
    ...edgeGroups,
    ...nodeGroups,
    ...edgeLabelGroups,
    ...subgraphTitles,
  ]) {
    parent.appendChild(child);
  }
}

function validateFinalLayout(input: FinalizeGeometryInput): string[] {
  const warnings: string[] = [];

  for (const subgraph of input.diagram.subgraphs) {
    if (!isLayoutHelperSubgraph(subgraph)) {
      continue;
    }

    if (input.subgraphFrames.has(subgraph.id)) {
      warnings.push(`Layout-helper subgraph "${subgraph.id}" rendered a visible frame.`);
    }
  }

  for (const node of input.diagram.nodes) {
    const visibleSubgraphId = getVisibleAncestorSubgraphId(input.diagram, node.subgraphId);
    const frame = visibleSubgraphId ? input.subgraphFrames.get(visibleSubgraphId) : undefined;
    const group = input.nodeGroups.get(node.id);

    if (!visibleSubgraphId || !frame || !group) {
      continue;
    }

    if (!containsBounds(getAbsoluteBounds(frame), getAbsoluteBounds(group))) {
      warnings.push(`Node "${node.id}" is outside visible parent subgraph "${visibleSubgraphId}".`);
    }
  }

  for (const edge of input.diagram.edges) {
    const group = input.edgeGroups.get(edge.id);

    if (!group) {
      continue;
    }

    warnings.push(...validateEdgeAnchors(edge, input));
    warnings.push(...validateEdgeIntersections(edge, input));
  }

  if (input.layoutSettings.layoutTarget === "slide-16-9") {
    const safeWidth =
      input.layoutSettings.targetCanvasWidth - input.layoutSettings.slideSafeMargin * 2;
    const safeHeight =
      input.layoutSettings.targetCanvasHeight - input.layoutSettings.slideSafeMargin * 2;

    if (input.rootFrame.width > safeWidth || input.rootFrame.height > safeHeight) {
      warnings.push(
        `Diagram exceeds slide-safe bounds (${round(input.rootFrame.width)}x${round(input.rootFrame.height)} over ${safeWidth}x${safeHeight}).`,
      );
    }
  }

  return warnings;
}

function validateEdgeAnchors(edge: DiagramEdge, input: FinalizeGeometryInput): string[] {
  const warnings: string[] = [];
  const source = input.nodeGroups.get(edge.from);
  const target = input.nodeGroups.get(edge.to);
  const edgeGroup = input.edgeGroups.get(edge.id);

  if (!source || !target || !edgeGroup) {
    return warnings;
  }

  const vector = edgeGroup.children.find((child) => child.type === "VECTOR") as
    | VectorNode
    | undefined;
  const first = vector?.vectorNetwork?.vertices[0];
  const vertices = vector?.vectorNetwork?.vertices;
  const last = vertices ? vertices[vertices.length - 1] : undefined;

  if (!first || !last) {
    return warnings;
  }

  const sourceBounds = getAbsoluteBounds(source);
  const targetBounds = getAbsoluteBounds(target);
  const vectorBounds = getAbsoluteBounds(vector);
  const firstAbsolute = {
    x: vectorBounds.x + first.x,
    y: vectorBounds.y + first.y,
  };
  const lastAbsolute = {
    x: vectorBounds.x + last.x,
    y: vectorBounds.y + last.y,
  };
  const sourceCenter = {
    x: sourceBounds.x + sourceBounds.width / 2,
    y: sourceBounds.y + sourceBounds.height / 2,
  };
  const targetCenter = {
    x: targetBounds.x + targetBounds.width / 2,
    y: targetBounds.y + targetBounds.height / 2,
  };
  const isHorizontal =
    Math.abs(targetCenter.x - sourceCenter.x) >= Math.abs(targetCenter.y - sourceCenter.y);

  if (
    isHorizontal &&
    Math.abs(firstAbsolute.y - (sourceBounds.y + sourceBounds.height / 2)) > anchorTolerance
  ) {
    warnings.push(`Edge "${edge.id}" source anchor is not centered on "${edge.from}".`);
  }

  if (
    isHorizontal &&
    Math.abs(lastAbsolute.y - (targetBounds.y + targetBounds.height / 2)) > anchorTolerance
  ) {
    warnings.push(`Edge "${edge.id}" target anchor is not centered on "${edge.to}".`);
  }

  if (!isHorizontal && Math.abs(firstAbsolute.x - sourceCenter.x) > anchorTolerance) {
    warnings.push(`Edge "${edge.id}" source anchor is not centered on "${edge.from}".`);
  }

  if (!isHorizontal && Math.abs(lastAbsolute.x - targetCenter.x) > anchorTolerance) {
    warnings.push(`Edge "${edge.id}" target anchor is not centered on "${edge.to}".`);
  }

  return warnings;
}

function validateEdgeIntersections(edge: DiagramEdge, input: FinalizeGeometryInput): string[] {
  const edgeGroup = input.edgeGroups.get(edge.id);
  const vector = edgeGroup?.children.find((child) => child.type === "VECTOR") as
    | VectorNode
    | undefined;
  const vertices = vector?.vectorNetwork?.vertices;

  if (!edgeGroup || !vertices || vertices.length < 2) {
    return [];
  }

  const vectorBounds = getAbsoluteBounds(vector);
  const points = vertices.map((vertex) => ({
    x: vectorBounds.x + vertex.x,
    y: vectorBounds.y + vertex.y,
  }));
  const intersectedNodeIds = input.diagram.nodes
    .filter((node) => node.id !== edge.from && node.id !== edge.to)
    .filter((node) => {
      const group = input.nodeGroups.get(node.id);
      return group ? pathIntersectsBounds(points, getAbsoluteBounds(group)) : false;
    })
    .map((node) => node.id);

  return intersectedNodeIds.map((id) => `Edge "${edge.id}" route intersects node "${id}".`);
}

function logFinalGeometry(input: FinalizeGeometryInput, warnings: string[]): void {
  console.log("[Mermaid finalization]", {
    edgeLabels: [...input.edgeLabelGroups.entries()].map(([id, group]) => ({
      bounds: getAbsoluteBounds(group),
      id,
    })),
    edges: [...input.edgeGroups.entries()].map(([id, group]) => ({
      bounds: getAbsoluteBounds(group),
      id,
    })),
    nodes: [...input.nodeGroups.entries()].map(([id, group]) => ({
      bounds: getAbsoluteBounds(group),
      id,
    })),
    subgraphs: input.diagram.subgraphs.map((subgraph) => ({
      bounds: input.subgraphFrames.get(subgraph.id)
        ? getAbsoluteBounds(input.subgraphFrames.get(subgraph.id)!)
        : null,
      id: subgraph.id,
      visibility: isLayoutHelperSubgraph(subgraph) ? "layout-only" : "visible",
    })),
    warnings,
  });
}

function getDepth(subgraphId: string, diagram: DiagramModel): number {
  const subgraphById = new Map(diagram.subgraphs.map((subgraph) => [subgraph.id, subgraph]));
  let depth = 0;
  let currentId = subgraphById.get(subgraphId)?.parentId;

  while (currentId) {
    depth += 1;
    currentId = subgraphById.get(currentId)?.parentId;
  }

  return depth;
}

function isKnownChild(node: SceneNode, nodes: Map<string, SceneNode>): boolean {
  return [...nodes.values()].some((entry) => entry.id === node.id);
}

function getAbsoluteBounds(node: SceneNode): Bounds {
  let x = "x" in node ? node.x : 0;
  let y = "y" in node ? node.y : 0;
  let parent = node.parent;

  while (parent && parent.type !== "PAGE") {
    if ("x" in parent && "y" in parent) {
      x += parent.x;
      y += parent.y;
    }

    parent = parent.parent;
  }

  return {
    height: "height" in node ? node.height : 0,
    width: "width" in node ? node.width : 0,
    x,
    y,
  };
}

function getLocalBounds(node: SceneNode): Bounds {
  return {
    height: "height" in node ? node.height : 0,
    width: "width" in node ? node.width : 0,
    x: "x" in node ? node.x : 0,
    y: "y" in node ? node.y : 0,
  };
}

function toLocalBounds(bounds: Bounds, parent: BaseNode | null): Bounds {
  if (!parent || parent.type === "PAGE") {
    return bounds;
  }

  const parentBounds = getAbsoluteBounds(parent as SceneNode);

  return {
    ...bounds,
    x: bounds.x - parentBounds.x,
    y: bounds.y - parentBounds.y,
  };
}

function unionBounds(bounds: Bounds[]): Bounds | null {
  if (bounds.length === 0) {
    return null;
  }

  const minX = Math.min(...bounds.map((entry) => entry.x));
  const minY = Math.min(...bounds.map((entry) => entry.y));
  const maxX = Math.max(...bounds.map((entry) => entry.x + entry.width));
  const maxY = Math.max(...bounds.map((entry) => entry.y + entry.height));

  return {
    height: round(maxY - minY),
    width: round(maxX - minX),
    x: round(minX),
    y: round(minY),
  };
}

function containsBounds(container: Bounds, child: Bounds): boolean {
  return (
    child.x >= container.x - 1 &&
    child.y >= container.y - 1 &&
    child.x + child.width <= container.x + container.width + 1 &&
    child.y + child.height <= container.y + container.height + 1
  );
}

function pathIntersectsBounds(points: Array<{ x: number; y: number }>, bounds: Bounds): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (segmentIntersectsBounds(points[index], points[index + 1], bounds)) {
      return true;
    }
  }

  return false;
}

function segmentIntersectsBounds(
  start: { x: number; y: number },
  end: { x: number; y: number },
  bounds: Bounds,
): boolean {
  if (start.x === end.x) {
    return (
      start.x >= bounds.x &&
      start.x <= bounds.x + bounds.width &&
      Math.max(start.y, end.y) >= bounds.y &&
      Math.min(start.y, end.y) <= bounds.y + bounds.height
    );
  }

  if (start.y === end.y) {
    return (
      start.y >= bounds.y &&
      start.y <= bounds.y + bounds.height &&
      Math.max(start.x, end.x) >= bounds.x &&
      Math.min(start.x, end.x) <= bounds.x + bounds.width
    );
  }

  return false;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
