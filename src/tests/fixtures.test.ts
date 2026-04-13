import { describe, expect, it } from "vitest";
import { classStylingFlowchart, simpleGraph, subgraphFlowchart } from "../fixtures";
import { layoutDiagram, parseMermaidFlowchart } from "../core";

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
});
