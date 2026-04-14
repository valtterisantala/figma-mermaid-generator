import { Graph, layout as runDagreLayout, type EdgeLabel, type GraphLabel } from "@dagrejs/dagre";
import { estimateMultilineTextBox } from "./text";
import type {
  DiagramEdge,
  DiagramLayoutEdge,
  DiagramLayoutNode,
  DiagramLayoutResult,
  DiagramModel,
  DiagramNode,
  DiagramSubgraph,
} from "./model";

type LayoutOptions = {
  nodeSep: number;
  rankSep: number;
  edgeSep: number;
  subgraphPadding: number;
};

type DagreNodeLabel = {
  width: number;
  height: number;
  x?: number;
  y?: number;
};

type DagreEdgeLabel = EdgeLabel & {
  id: string;
};

const defaultLayoutOptions: LayoutOptions = {
  nodeSep: 56,
  rankSep: 96,
  edgeSep: 24,
  subgraphPadding: 32,
};

const maxBoxLikeNodeTextWidth = 220;

const minNodeSizeByShape: Record<DiagramNode["shape"], { width: number; height: number }> = {
  asymmetric: { width: 120, height: 56 },
  circle: { width: 72, height: 72 },
  diamond: { width: 112, height: 80 },
  rectangle: { width: 112, height: 56 },
  rounded: { width: 112, height: 56 },
  stadium: { width: 128, height: 56 },
};

export function layoutDiagram(
  diagram: DiagramModel,
  options: Partial<LayoutOptions> = {},
): DiagramLayoutResult {
  const resolvedOptions = {
    ...defaultLayoutOptions,
    ...options,
  };
  const graph = new Graph<GraphLabel, DagreNodeLabel, DagreEdgeLabel>({
    directed: true,
    multigraph: true,
  });

  graph.setGraph({
    edgesep: resolvedOptions.edgeSep,
    marginx: 0,
    marginy: 0,
    nodesep: resolvedOptions.nodeSep,
    rankdir: diagram.direction === "LR" ? "LR" : "TB",
    ranksep: resolvedOptions.rankSep,
  });
  graph.setDefaultEdgeLabel(() => ({ id: "" }));

  for (const node of diagram.nodes) {
    graph.setNode(node.id, estimateNodeSize(node));
  }

  for (const subgraphId of getSubgraphEdgeEndpointIds(diagram)) {
    graph.setNode(subgraphId, estimateSubgraphEndpointSize(subgraphId, diagram.subgraphs));
  }

  for (const edge of diagram.edges) {
    graph.setEdge(edge.from, edge.to, estimateEdgeLabel(edge), edge.id);
  }

  runDagreLayout(graph);

  const nodes = diagram.nodes.map((node) => toLayoutNode(node, graph.node(node.id)));
  const edges = diagram.edges.map((edge) =>
    toLayoutEdge(edge, graph.edge(edge.from, edge.to, edge.id)),
  );
  const normalizedNodes = normalizeRepeatedPhaseMotifs(diagram, nodes);
  const subgraphs = diagram.subgraphs.map((subgraph) =>
    toLayoutSubgraph(subgraph, normalizedNodes, edges, resolvedOptions.subgraphPadding),
  );

  return {
    nodes: normalizedNodes,
    edges,
    subgraphs,
  };
}

function estimateNodeSize(node: DiagramNode): DagreNodeLabel {
  const minimum = minNodeSizeByShape[node.shape];
  const labelBox = estimateMultilineTextBox(node.label, {
    fontSize: 13,
    horizontalPadding: 32,
    maxTextWidth: isBoxLikeShape(node.shape) ? maxBoxLikeNodeTextWidth : undefined,
    minHeight: minimum.height,
    minWidth: minimum.width,
    verticalPadding: 20,
  });

  return {
    width: labelBox.width,
    height: labelBox.height,
  };
}

type PhaseMotif = {
  phaseId: string;
  middleIds: [string, string];
  outputId: string;
};

function normalizeRepeatedPhaseMotifs(
  diagram: DiagramModel,
  nodes: DiagramLayoutNode[],
): DiagramLayoutNode[] {
  if (diagram.direction !== "LR") {
    return nodes;
  }

  const motifs = findRepeatedPhaseMotifs(diagram);

  if (motifs.length === 0) {
    return nodes;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, { ...node }]));

  for (const motif of motifs) {
    const middleNodes = motif.middleIds
      .map((id) => nodeById.get(id))
      .filter((node): node is DiagramLayoutNode => Boolean(node));

    if (middleNodes.length !== 2) {
      continue;
    }

    const sharedRightEdge = Math.max(...middleNodes.map((node) => node.x + node.width));

    for (const node of middleNodes) {
      node.x = round(sharedRightEdge - node.width);
    }
  }

  return nodes.map((node) => nodeById.get(node.id) ?? node);
}

function findRepeatedPhaseMotifs(diagram: DiagramModel): PhaseMotif[] {
  const nodeIds = new Set(diagram.nodes.map((node) => node.id));
  const outgoingTargetsByNode = new Map<string, Set<string>>();

  for (const edge of diagram.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      continue;
    }

    const targets = outgoingTargetsByNode.get(edge.from) ?? new Set<string>();
    targets.add(edge.to);
    outgoingTargetsByNode.set(edge.from, targets);
  }

  const motifs: PhaseMotif[] = [];
  const seenOutputs = new Set<string>();

  for (const node of diagram.nodes) {
    const outgoingTargets = [...(outgoingTargetsByNode.get(node.id) ?? new Set<string>())];

    if (outgoingTargets.length !== 2) {
      continue;
    }

    const [firstMiddleId, secondMiddleId] = outgoingTargets;
    const firstMiddleTargets = outgoingTargetsByNode.get(firstMiddleId) ?? new Set<string>();
    const secondMiddleTargets = outgoingTargetsByNode.get(secondMiddleId) ?? new Set<string>();
    const sharedOutputs = [...firstMiddleTargets].filter((targetId) =>
      secondMiddleTargets.has(targetId),
    );

    if (sharedOutputs.length !== 1) {
      continue;
    }

    const outputId = sharedOutputs[0];

    if (seenOutputs.has(outputId)) {
      continue;
    }

    motifs.push({
      phaseId: node.id,
      middleIds: [outgoingTargets[0], outgoingTargets[1]],
      outputId,
    });
    seenOutputs.add(outputId);
  }

  return motifs;
}

function isBoxLikeShape(shape: DiagramNode["shape"]): boolean {
  return (
    shape === "rectangle" || shape === "rounded" || shape === "stadium" || shape === "asymmetric"
  );
}

function estimateEdgeLabel(edge: DiagramEdge): DagreEdgeLabel {
  if (!edge.label) {
    return {
      id: edge.id,
      height: 0,
      width: 0,
    };
  }

  const labelBox = estimateMultilineTextBox(edge.label, {
    fontSize: 12,
    horizontalPadding: 20,
    minHeight: 24,
    minWidth: 20,
    verticalPadding: 8,
  });

  return {
    id: edge.id,
    height: labelBox.height,
    labelpos: "c",
    width: labelBox.width,
  };
}

function estimateSubgraphEndpointSize(
  subgraphId: string,
  subgraphs: DiagramSubgraph[],
): DagreNodeLabel {
  const subgraph = subgraphs.find((entry) => entry.id === subgraphId);
  const labelBox = estimateMultilineTextBox(subgraph?.label ?? subgraphId, {
    fontSize: 13,
    horizontalPadding: 64,
    minHeight: 96,
    minWidth: 160,
    verticalPadding: 24,
  });

  return {
    width: labelBox.width,
    height: labelBox.height,
  };
}

function getSubgraphEdgeEndpointIds(diagram: DiagramModel): string[] {
  const nodeIds = new Set(diagram.nodes.map((node) => node.id));
  const subgraphIds = new Set(diagram.subgraphs.map((subgraph) => subgraph.id));
  const endpointIds = new Set<string>();

  for (const edge of diagram.edges) {
    for (const id of [edge.from, edge.to]) {
      if (subgraphIds.has(id) && !nodeIds.has(id)) {
        endpointIds.add(id);
      }
    }
  }

  return [...endpointIds];
}

function toLayoutNode(node: DiagramNode, label: DagreNodeLabel): DiagramLayoutNode {
  if (label.x === undefined || label.y === undefined) {
    throw new Error(`Dagre did not produce coordinates for node "${node.id}".`);
  }

  return {
    id: node.id,
    x: round(label.x - label.width / 2),
    y: round(label.y - label.height / 2),
    width: round(label.width),
    height: round(label.height),
  };
}

function toLayoutEdge(edge: DiagramEdge, label: DagreEdgeLabel): DiagramLayoutEdge {
  return {
    id: edge.id,
    points: (label.points ?? []).map((point) => ({
      x: round(point.x),
      y: round(point.y),
    })),
    labelPosition:
      label.x !== undefined && label.y !== undefined
        ? {
            x: round(label.x),
            y: round(label.y),
          }
        : getMidpoint(label.points),
  };
}

function toLayoutSubgraph(
  subgraph: DiagramSubgraph,
  nodes: DiagramLayoutNode[],
  edges: DiagramLayoutEdge[],
  padding: number,
): DiagramLayoutResult["subgraphs"][number] {
  const memberNodeIds = new Set(subgraph.nodeIds);
  const memberEdgeIds = new Set(subgraph.edgeIds);
  const memberBoxes = nodes
    .filter((node) => memberNodeIds.has(node.id))
    .map((node) => ({
      maxX: node.x + node.width,
      maxY: node.y + node.height,
      minX: node.x,
      minY: node.y,
    }));
  const memberPoints = edges
    .filter((edge) => memberEdgeIds.has(edge.id))
    .flatMap((edge) => edge.points)
    .map((point) => ({
      maxX: point.x,
      maxY: point.y,
      minX: point.x,
      minY: point.y,
    }));
  const boxes = [...memberBoxes, ...memberPoints];

  if (boxes.length === 0) {
    return {
      id: subgraph.id,
      x: 0,
      y: 0,
      width: padding * 2,
      height: padding * 2,
    };
  }

  const minX = Math.min(...boxes.map((box) => box.minX)) - padding;
  const minY = Math.min(...boxes.map((box) => box.minY)) - padding;
  const maxX = Math.max(...boxes.map((box) => box.maxX)) + padding;
  const maxY = Math.max(...boxes.map((box) => box.maxY)) + padding;

  return {
    id: subgraph.id,
    x: round(minX),
    y: round(minY),
    width: round(maxX - minX),
    height: round(maxY - minY),
  };
}

function getMidpoint(points: EdgeLabel["points"]): DiagramLayoutEdge["labelPosition"] {
  if (!points || points.length === 0) {
    return undefined;
  }

  const point = points[Math.floor(points.length / 2)];

  return {
    x: round(point.x),
    y: round(point.y),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
