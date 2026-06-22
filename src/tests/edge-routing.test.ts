import { describe, expect, it } from "vitest";
import {
  buildCollapsedReturnPath,
  buildDiagramEdgePath,
  createCollapsedReturnGroups,
  buildOrthogonalPath,
  createEdgeRoutingPlans,
  type EdgeSide,
  getConnectionAnchor,
  getNodeBounds,
  isOrthogonalPath,
  pathIntersectsNodeBox,
  type NodeBox,
} from "../main/edge-routing";
import { getVisualNodeBox } from "../main/render-edges";
import {
  connectorCenteringLrFlowchart,
  connectorCenteringSubgraphFlowchart,
  connectorCenteringTdFlowchart,
  crossSubgraphFeedbackFlowchart,
  fanOutFourFlowchart,
  fullConnectorStressFlowchart,
  lrSubgraphChainFlowchart,
  realtimeTouchEventComparison,
  simpleLrChainFlowchart,
  tdVerticalArchitectureFlowchart,
} from "../fixtures";
import { layoutDiagram, parseMermaidFlowchart } from "../core";
import { getVisibleAncestorSubgraphId } from "../main/subgraph-visibility";

const rectangle = (id: string, x: number, y: number): NodeBox => ({
  id,
  shape: "rectangle",
  x,
  y,
  width: 120,
  height: 60,
});

const boxById = (boxes: NodeBox[], id: string): NodeBox => {
  const box = boxes.find((entry) => entry.id === id);

  if (!box) {
    throw new Error(`Missing node box "${id}".`);
  }

  return box;
};

const shrinkBox = (box: NodeBox, padding: number): NodeBox => ({
  ...box,
  x: box.x + padding,
  y: box.y + padding,
  width: Math.max(0, box.width - padding * 2),
  height: Math.max(0, box.height - padding * 2),
});

const toRootBoxes = (source: string): NodeBox[] => {
  const diagram = parseMermaidFlowchart(source);
  const layout = layoutDiagram(diagram);
  return layout.nodes.map((node) => {
    const diagramNode = diagram.nodes.find((entry) => entry.id === node.id);

    if (!diagramNode) {
      throw new Error(`Missing diagram node "${node.id}".`);
    }

    const visibleSubgraphId = getVisibleAncestorSubgraphId(diagram, diagramNode.subgraphId);

    return getVisualNodeBox({
      diagramNode,
      layoutNode: node,
      originX: 0,
      originY: 0,
      parentTitleHeight: visibleSubgraphId
        ? diagram.subgraphs.find((subgraph) => subgraph.id === visibleSubgraphId)?.label.trim()
          ? 28
          : 0
        : 0,
    });
  });
};

const getPathBounds = (points: Array<{ x: number; y: number }>) => ({
  minX: Math.min(...points.map((point) => point.x)),
  minY: Math.min(...points.map((point) => point.y)),
  maxX: Math.max(...points.map((point) => point.x)),
  maxY: Math.max(...points.map((point) => point.y)),
});

const getRoutedFixturePaths = (source: string) => {
  const diagram = parseMermaidFlowchart(source);
  const layout = layoutDiagram(diagram);
  const boxes = toRootBoxes(source);
  const boxByNodeId = new Map(boxes.map((box) => [box.id, box]));
  const plans = createEdgeRoutingPlans(diagram.edges, boxByNodeId, diagram.direction);
  const bounds = getNodeBounds(boxes);

  return {
    bounds,
    diagram,
    layout,
    paths: diagram.edges.map((edge) => {
      const from = boxByNodeId.get(edge.from);
      const to = boxByNodeId.get(edge.to);
      const layoutEdge = layout.edges.find((entry) => entry.id === edge.id);
      const plan = plans.get(edge.id);

      if (!from || !to || !layoutEdge || !plan) {
        throw new Error(`Missing routing input for edge "${edge.id}".`);
      }

      return {
        edge,
        path: buildDiagramEdgePath({
          bounds,
          direction: diagram.direction,
          from,
          plan,
          routeHints: layoutEdge.points,
          to,
        }),
        plan,
      };
    }),
  };
};

const getCollapsedRouteFixturePaths = (source: string, collapseReturnEdges: boolean) => {
  const diagram = parseMermaidFlowchart(source);
  const layout = layoutDiagram(diagram);
  const boxes = toRootBoxes(source);
  const boxByNodeId = new Map(boxes.map((box) => [box.id, box]));
  const collapsedGroups = createCollapsedReturnGroups(
    diagram.edges,
    boxByNodeId,
    diagram.direction,
    collapseReturnEdges,
  );
  const collapsedEdgeIds = new Set(collapsedGroups.flatMap((group) => group.edgeIds));
  const bounds = getNodeBounds(boxes);

  return {
    bounds,
    boxes,
    collapsedGroups,
    diagram,
    layout,
    renderedConnectorCount:
      diagram.edges.filter((edge) => !collapsedEdgeIds.has(edge.id)).length +
      collapsedGroups.length,
    paths: collapsedGroups.map((group) => ({
      group,
      path: buildCollapsedReturnPath({
        bounds,
        direction: diagram.direction,
        group,
        nodeBoxes: boxByNodeId,
        obstacles: boxes,
      }),
    })),
  };
};

const expectAnchorOnCenterline = (box: NodeBox, side: EdgeSide) => {
  const anchor = getConnectionAnchor(box, side);
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  if (side === "left") {
    expect(anchor).toEqual({ x: box.x, y: centerY });
    return;
  }

  if (side === "right") {
    expect(anchor).toEqual({ x: box.x + box.width, y: centerY });
    return;
  }

  if (side === "top") {
    expect(anchor).toEqual({ x: centerX, y: box.y });
    return;
  }

  expect(anchor).toEqual({ x: centerX, y: box.y + box.height });
};

describe("buildOrthogonalPath", () => {
  it("creates axis-aligned segments for left-to-right edges", () => {
    const path = buildOrthogonalPath(rectangle("A", 0, 0), rectangle("B", 240, 0), []);

    expect(isOrthogonalPath(path)).toBe(true);
    expect(path[0].x).toBeGreaterThan(0);
    expect(path[path.length - 1].x).toBeGreaterThan(path[0].x);
    expect(path[path.length - 2].y).toBe(path[path.length - 1].y);
  });

  it("creates axis-aligned segments for top-to-bottom edges", () => {
    const path = buildOrthogonalPath(rectangle("A", 0, 0), rectangle("B", 0, 220), []);

    expect(isOrthogonalPath(path)).toBe(true);
    expect(path[0].y).toBeGreaterThanOrEqual(0);
    expect(path[path.length - 1].y).toBeGreaterThan(path[0].y);
    expect(path[path.length - 2].x).toBe(path[path.length - 1].x);
  });

  it("uses route hints to build a multi-segment orthogonal path", () => {
    const path = buildOrthogonalPath(rectangle("A", 0, 0), rectangle("B", 260, 180), [
      { x: 130, y: 20 },
      { x: 130, y: 220 },
    ]);

    expect(isOrthogonalPath(path)).toBe(true);
    expect(path.length).toBeGreaterThanOrEqual(4);
    expect(path.some((point) => point.x === 130)).toBe(true);
  });

  it("supports forcing right-to-left anchors for LR parallel-stage routing", () => {
    const path = buildOrthogonalPath(rectangle("A", 0, 120), rectangle("B", 260, 0), [], {
      startSide: "right",
      endSide: "left",
    });

    expect(isOrthogonalPath(path)).toBe(true);
    expect(path[0].x).toBe(120);
    expect(path[path.length - 1].x).toBe(260);
  });

  it("anchors LR edges at the visual vertical center of differently sized nodes", () => {
    const source: NodeBox = {
      id: "source",
      shape: "rounded",
      x: 12,
      y: 40,
      width: 240,
      height: 92,
    };
    const target: NodeBox = {
      id: "target",
      shape: "rounded",
      x: 360,
      y: 24,
      width: 180,
      height: 124,
    };

    expect(getConnectionAnchor(source, "right")).toEqual({
      x: 252,
      y: 86,
    });
    expect(getConnectionAnchor(target, "left")).toEqual({
      x: 360,
      y: 86,
    });
  });

  it("anchors TD edges at the visual horizontal center of multiline nodes", () => {
    const source: NodeBox = {
      id: "source",
      shape: "rectangle",
      x: 24,
      y: 10,
      width: 252,
      height: 128,
    };
    const target: NodeBox = {
      id: "target",
      shape: "rectangle",
      x: 54,
      y: 260,
      width: 192,
      height: 88,
    };

    expect(getConnectionAnchor(source, "bottom")).toEqual({
      x: 150,
      y: 138,
    });
    expect(getConnectionAnchor(target, "top")).toEqual({
      x: 150,
      y: 260,
    });
  });

  it("uses final visual node bounds after subgraph title offsets", () => {
    const box = getVisualNodeBox({
      diagramNode: {
        id: "A",
        shape: "rounded",
        subgraphId: "Cluster",
      },
      layoutNode: {
        id: "A",
        x: 140,
        y: 220,
        width: 180,
        height: 96,
      },
      originX: 40,
      originY: 80,
      parentTitleHeight: 28,
    });

    expect(box).toEqual({
      id: "A",
      shape: "rounded",
      x: 100,
      y: 168,
      width: 180,
      height: 96,
    });
    expect(getConnectionAnchor(box, "left")).toEqual({
      x: 100,
      y: 216,
    });
  });

  it("keeps LR connector anchors centered for single-line, multiline, and wrapped nodes", () => {
    const boxes = toRootBoxes(connectorCenteringLrFlowchart);

    for (const id of ["A", "B", "C"]) {
      const box = boxById(boxes, id);
      expectAnchorOnCenterline(box, "left");
      expectAnchorOnCenterline(box, "right");
    }
  });

  it("keeps TD connector anchors centered for single-line, multiline, and wrapped nodes", () => {
    const boxes = toRootBoxes(connectorCenteringTdFlowchart);

    for (const id of ["A", "B", "C"]) {
      const box = boxById(boxes, id);
      expectAnchorOnCenterline(box, "top");
      expectAnchorOnCenterline(box, "bottom");
    }
  });

  it("keeps nested subgraph node anchors centered after final visual offsets", () => {
    const boxes = toRootBoxes(connectorCenteringSubgraphFlowchart);
    const singleLine = boxById(boxes, "A");
    const multiline = boxById(boxes, "B");
    const wrapped = boxById(boxes, "C");

    expect(singleLine.y).toBeGreaterThan(0);
    expect(multiline.y).toBeGreaterThan(0);
    expect(wrapped.y).toBeGreaterThan(0);
    expectAnchorOnCenterline(singleLine, "right");
    expectAnchorOnCenterline(multiline, "left");
    expectAnchorOnCenterline(wrapped, "left");
  });

  it("uses visible parent subgraph title offsets for helper-column fixture nodes", () => {
    const boxes = toRootBoxes(realtimeTouchEventComparison);
    const client = boxById(boxes, "currClient");
    const ably = boxById(boxes, "currAbly");

    expect(client.y).toBeGreaterThanOrEqual(28);
    expect(ably.y).toBeGreaterThanOrEqual(28);
    expectAnchorOnCenterline(client, "right");
    expectAnchorOnCenterline(ably, "left");
  });

  it.each([
    {
      edgeCount: 2,
      nodeCount: 3,
      source: simpleLrChainFlowchart,
      subgraphCount: 0,
      title: "simple LR chain",
    },
    {
      edgeCount: 2,
      nodeCount: 3,
      source: lrSubgraphChainFlowchart,
      subgraphCount: 3,
      title: "LR chain with subgraphs",
    },
    {
      edgeCount: 4,
      nodeCount: 5,
      source: fanOutFourFlowchart,
      subgraphCount: 0,
      title: "fan-out from one node to four nodes",
    },
    {
      edgeCount: 4,
      nodeCount: 3,
      source: crossSubgraphFeedbackFlowchart,
      subgraphCount: 2,
      title: "cross-subgraph feedback loop",
    },
    {
      edgeCount: 14,
      nodeCount: 11,
      source: fullConnectorStressFlowchart,
      subgraphCount: 4,
      title: "full connector stress diagram",
    },
    {
      edgeCount: 4,
      nodeCount: 5,
      source: tdVerticalArchitectureFlowchart,
      subgraphCount: 3,
      title: "TD vertical architecture diagram",
    },
  ])(
    "creates bounded routed edge paths for $title",
    ({ edgeCount, nodeCount, source, subgraphCount }) => {
      const { bounds, diagram, paths } = getRoutedFixturePaths(source);
      const diagramWidth = Math.max(1, bounds.maxX - bounds.minX);
      const diagramHeight = Math.max(1, bounds.maxY - bounds.minY);

      expect(diagram.nodes).toHaveLength(nodeCount);
      expect(diagram.subgraphs).toHaveLength(subgraphCount);
      expect(diagram.edges).toHaveLength(edgeCount);
      expect(paths).toHaveLength(edgeCount);

      for (const { path } of paths) {
        expect(path.length).toBeGreaterThanOrEqual(2);
        expect(isOrthogonalPath(path)).toBe(true);

        const pathBounds = getPathBounds(path);
        const pathWidth = pathBounds.maxX - pathBounds.minX;
        const pathHeight = pathBounds.maxY - pathBounds.minY;

        expect(pathWidth + pathHeight).toBeGreaterThan(0);
        expect(pathBounds.minX).toBeGreaterThanOrEqual(bounds.minX - diagramWidth * 0.25 - 80);
        expect(pathBounds.maxX).toBeLessThanOrEqual(bounds.maxX + diagramWidth * 0.5 + 160);
        expect(pathBounds.minY).toBeGreaterThanOrEqual(bounds.minY - diagramHeight * 0.25 - 80);
        expect(pathBounds.maxY).toBeLessThanOrEqual(bounds.maxY + diagramHeight * 0.75 + 220);
      }
    },
  );

  it("routes LR feedback loops below the diagram instead of through a huge horizontal loop", () => {
    const { bounds, paths } = getRoutedFixturePaths(fullConnectorStressFlowchart);
    const feedbackPaths = paths.filter(({ plan }) => plan.mode === "feedback");

    expect(feedbackPaths).toHaveLength(4);

    for (const { path } of feedbackPaths) {
      const pathBounds = getPathBounds(path);

      expect(pathBounds.maxY).toBeGreaterThan(bounds.maxY);
      expect(pathBounds.minX).toBeGreaterThanOrEqual(bounds.minX - 8);
      expect(pathBounds.maxX).toBeLessThanOrEqual(bounds.maxX + 8);
    }
  });

  it("uses a shared trunk corridor for LR fan-out edges", () => {
    const { paths } = getRoutedFixturePaths(fanOutFourFlowchart);
    const fanOutPaths = paths.filter(({ plan }) => plan.mode === "fanout");
    const trunkXs = fanOutPaths.map(({ plan }) => plan.fanOutTrunk);

    expect(fanOutPaths).toHaveLength(4);
    expect(new Set(trunkXs)).toHaveLength(1);
  });

  it("collapses repeated backward edges to the same target when enabled", () => {
    const collapsed = getCollapsedRouteFixturePaths(fullConnectorStressFlowchart, true);
    const expanded = getCollapsedRouteFixturePaths(fullConnectorStressFlowchart, false);

    expect(collapsed.collapsedGroups).toEqual([
      expect.objectContaining({
        sourceIds: ["H", "I", "J", "K"],
        targetId: "A",
      }),
    ]);
    expect(collapsed.renderedConnectorCount).toBe(11);
    expect(expanded.collapsedGroups).toHaveLength(0);
    expect(expanded.renderedConnectorCount).toBe(14);
  });

  it("does not collapse a single backward edge", () => {
    const collapsed = getCollapsedRouteFixturePaths(
      `flowchart LR
      A[Start] --> B[Done]
      B --> A`,
      true,
    );

    expect(collapsed.collapsedGroups).toHaveLength(0);
    expect(collapsed.renderedConnectorCount).toBe(2);
  });

  it("routes collapsed returns without crossing source output nodes or the target node", () => {
    const { boxes, bounds, paths } = getCollapsedRouteFixturePaths(
      fullConnectorStressFlowchart,
      true,
    );
    const collapsed = paths[0];

    expect(collapsed.path.length).toBeGreaterThanOrEqual(2);

    const pathBounds = getPathBounds(collapsed.path);
    const diagramWidth = Math.max(1, bounds.maxX - bounds.minX);
    const diagramHeight = Math.max(1, bounds.maxY - bounds.minY);
    const guardedNodeIds = new Set(["A", "H", "I", "J", "K"]);
    const guardedBoxes = boxes
      .filter((box) => guardedNodeIds.has(box.id))
      .map((box) => shrinkBox(box, 2));

    for (const box of guardedBoxes) {
      expect(pathIntersectsNodeBox(collapsed.path, box)).toBe(false);
    }

    expect(pathBounds.maxX - pathBounds.minX).toBeGreaterThan(0);
    expect(pathBounds.maxY - pathBounds.minY).toBeGreaterThan(0);
    expect(pathBounds.minX).toBeGreaterThanOrEqual(bounds.minX - diagramWidth * 0.25 - 120);
    expect(pathBounds.maxX).toBeLessThanOrEqual(bounds.maxX + diagramWidth * 0.25 + 120);
    expect(pathBounds.minY).toBeGreaterThanOrEqual(bounds.minY - diagramHeight * 0.5 - 160);
    expect(pathBounds.maxY).toBeLessThanOrEqual(bounds.maxY + diagramHeight * 0.5 + 160);
    expect(pathBounds.maxY).toBeGreaterThan(bounds.maxY);
  });
});
