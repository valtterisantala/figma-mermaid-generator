import { describe, expect, it } from "vitest";
import {
  buildOrthogonalPath,
  type EdgeSide,
  getConnectionAnchor,
  isOrthogonalPath,
  type NodeBox,
} from "../main/edge-routing";
import { getVisualNodeBox } from "../main/render-edges";
import {
  connectorCenteringLrFlowchart,
  connectorCenteringSubgraphFlowchart,
  connectorCenteringTdFlowchart,
  realtimeTouchEventComparison,
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
});
