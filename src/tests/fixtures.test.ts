import { describe, expect, it } from "vitest";
import {
  classStylingFlowchart,
  heavyAssetPipelineComparison,
  realtimeTouchEventComparison,
  simpleGraph,
  subgraphFlowchart,
} from "../fixtures";
import { layoutDiagram, parseMermaidFlowchart } from "../core";
import { getVisibleAncestorSubgraphId, isLayoutHelperSubgraph } from "../main/subgraph-visibility";

describe("Mermaid fixtures", () => {
  it.each([
    ["simple graph", simpleGraph],
    ["subgraph", subgraphFlowchart],
    ["class styling", classStylingFlowchart],
  ])("parses and lays out the %s fixture", (_name, source) => {
    const diagram = parseMermaidFlowchart(source);
    const layout = layoutDiagram(diagram);

    expect(diagram.nodes.length).toBeGreaterThan(0);
    expect(diagram.edges.length).toBeGreaterThan(0);
    expect(layout.nodes).toHaveLength(diagram.nodes.length);
    expect(layout.edges).toHaveLength(diagram.edges.length);
  });

  it.each([
    ["realtime touch event comparison", realtimeTouchEventComparison],
    ["heavy asset pipeline comparison", heavyAssetPipelineComparison],
  ])("treats helper columns as layout-only in the %s fixture", (_name, source) => {
    const diagram = parseMermaidFlowchart(source);
    const helperIds = [
      "currentCol1",
      "currentCol2",
      "currentCol3",
      "localCol1",
      "localCol2",
      "localCol3",
    ];

    for (const id of helperIds) {
      const subgraph = diagram.subgraphs.find((entry) => entry.id === id);
      expect(subgraph).toBeDefined();
      expect(isLayoutHelperSubgraph(subgraph!)).toBe(true);
    }
  });

  it("preserves real section titles while hiding realtime helper columns", () => {
    const diagram = parseMermaidFlowchart(realtimeTouchEventComparison);
    const current = diagram.subgraphs.find((subgraph) => subgraph.id === "current");
    const local = diagram.subgraphs.find((subgraph) => subgraph.id === "local");

    expect(current?.label).toBe("Current Framework Realtime Flow");
    expect(local?.label).toBe("Local Realtime Advantage");
    expect(isLayoutHelperSubgraph(current!)).toBe(false);
    expect(isLayoutHelperSubgraph(local!)).toBe(false);
  });

  it("renders helper-column children in their nearest visible parent subgraph", () => {
    const diagram = parseMermaidFlowchart(realtimeTouchEventComparison);
    const currentClient = diagram.nodes.find((node) => node.id === "currClient");
    const localBus = diagram.nodes.find((node) => node.id === "localBus");
    const currentEdge = diagram.edges.find(
      (edge) => edge.from === "currClient" && edge.to === "currAbly",
    );

    expect(currentClient?.subgraphId).toBe("currentCol1");
    expect(localBus?.subgraphId).toBe("localCol2");
    expect(currentEdge?.subgraphId).toBe("current");
    expect(getVisibleAncestorSubgraphId(diagram, currentClient?.subgraphId)).toBe("current");
    expect(getVisibleAncestorSubgraphId(diagram, localBus?.subgraphId)).toBe("local");
    expect(getVisibleAncestorSubgraphId(diagram, currentEdge?.subgraphId)).toBe("current");
  });
});
