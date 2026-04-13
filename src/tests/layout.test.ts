import { describe, expect, it } from "vitest";
import { basicFlowchart } from "../fixtures/basic-flowchart";
import { layoutDiagram, parseMermaidFlowchart } from "../core";

describe("layoutDiagram", () => {
  it("produces deterministic coordinates and edge routes for TD graphs", () => {
    const diagram = parseMermaidFlowchart(basicFlowchart);
    const layout = layoutDiagram(diagram);
    const start = layout.nodes.find((node) => node.id === "Start");
    const decision = layout.nodes.find((node) => node.id === "Decision");
    const labeledEdge = layout.edges.find((edge) => edge.id === "edge_2_Decision_to_Done_Yes");

    expect(layout.nodes).toHaveLength(diagram.nodes.length);
    expect(layout.edges).toHaveLength(diagram.edges.length);
    expect(start).toBeDefined();
    expect(decision).toBeDefined();
    expect(decision?.y).toBeGreaterThan(start?.y ?? 0);
    expect(labeledEdge?.points.length).toBeGreaterThan(1);
    expect(labeledEdge?.labelPosition).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    );
    expect(layoutDiagram(diagram)).toEqual(layout);
  });

  it("honors LR direction by laying connected nodes left to right", () => {
    const diagram = parseMermaidFlowchart(`flowchart LR
      A[Alpha] --> B[Beta]
      B --> C[Gamma]`);
    const layout = layoutDiagram(diagram);
    const alpha = layout.nodes.find((node) => node.id === "A");
    const beta = layout.nodes.find((node) => node.id === "B");
    const gamma = layout.nodes.find((node) => node.id === "C");

    expect(beta?.x).toBeGreaterThan(alpha?.x ?? 0);
    expect(gamma?.x).toBeGreaterThan(beta?.x ?? 0);
  });

  it("computes subgraph bounds around member nodes and edges", () => {
    const diagram = parseMermaidFlowchart(`flowchart LR
      subgraph Cluster[Input cluster]
        A[Alpha] --> B[Beta]
      end
      B --> C[Gamma]`);
    const layout = layoutDiagram(diagram);
    const subgraph = layout.subgraphs.find((entry) => entry.id === "Cluster");
    const memberNodes = layout.nodes.filter((node) => node.id === "A" || node.id === "B");

    expect(subgraph).toBeDefined();
    for (const node of memberNodes) {
      expect(subgraph?.x).toBeLessThanOrEqual(node.x);
      expect(subgraph?.y).toBeLessThanOrEqual(node.y);
      expect((subgraph?.x ?? 0) + (subgraph?.width ?? 0)).toBeGreaterThanOrEqual(
        node.x + node.width,
      );
      expect((subgraph?.y ?? 0) + (subgraph?.height ?? 0)).toBeGreaterThanOrEqual(
        node.y + node.height,
      );
    }
  });

  it("keeps edge routes near node boundaries instead of node centers", () => {
    const diagram = parseMermaidFlowchart(`flowchart TD
      A[Start] --> B[Done]`);
    const layout = layoutDiagram(diagram);
    const source = layout.nodes.find((node) => node.id === "A");
    const target = layout.nodes.find((node) => node.id === "B");
    const edge = layout.edges[0];

    expect(source).toBeDefined();
    expect(target).toBeDefined();
    expect(edge.points.length).toBeGreaterThanOrEqual(2);

    const firstPoint = edge.points[0];
    const lastPoint = edge.points[edge.points.length - 1];

    expect(firstPoint.y).toBeGreaterThan(source?.y ?? 0);
    expect(firstPoint.y).toBeLessThan((source?.y ?? 0) + (source?.height ?? 0) + 8);
    expect(lastPoint.y).toBeGreaterThanOrEqual((target?.y ?? 0) - 8);
    expect(lastPoint.y).toBeLessThan((target?.y ?? 0) + (target?.height ?? 0));
  });
});
