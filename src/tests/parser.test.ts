import { describe, expect, it } from "vitest";
import { basicFlowchart } from "../fixtures/basic-flowchart";
import { classStylingFlowchart } from "../fixtures";
import { MermaidParseError, parseMermaidFlowchart } from "../core";

describe("parseMermaidFlowchart", () => {
  it("normalizes a basic flowchart into the internal model", () => {
    const diagram = parseMermaidFlowchart(basicFlowchart);

    expect(diagram.direction).toBe("TD");
    expect(diagram.nodes).toHaveLength(4);
    expect(diagram.edges).toHaveLength(4);
    expect(diagram.styles).toEqual([
      {
        id: "primary",
        properties: {
          fill: "#ffffff",
          stroke: "#18a0fb",
        },
      },
    ]);
    expect(diagram.nodes.find((node) => node.id === "Decision")).toMatchObject({
      label: "Ready?",
      shape: "diamond",
    });
    expect(diagram.nodes.find((node) => node.id === "Done")).toMatchObject({
      classIds: ["primary"],
      label: "Done",
      shape: "circle",
    });
    expect(diagram.edges[1]).toMatchObject({
      from: "Decision",
      to: "Done",
      kind: "arrow",
      label: "Yes",
    });
    expect(diagram.edges[1].id).toBe("edge_2_Decision_to_Done_Yes");
  });

  it("captures subgraph membership without coupling to rendering", () => {
    const diagram = parseMermaidFlowchart(`flowchart LR
      subgraph Cluster[Input cluster]
        A[Alpha] --> B[Beta]
      end
      B --> C[Gamma]`);

    expect(diagram.subgraphs).toEqual([
      {
        id: "Cluster",
        sourceId: "Cluster",
        label: "Input cluster",
        parentId: undefined,
        nodeIds: ["A", "B"],
        edgeIds: ["edge_1_A_to_B"],
      },
    ]);
    expect(diagram.nodes.find((node) => node.id === "A")?.subgraphId).toBe("Cluster");
    expect(diagram.nodes.find((node) => node.id === "C")?.subgraphId).toBeUndefined();
  });

  it("rejects unsupported diagram directions with a useful line number", () => {
    expect(() => parseMermaidFlowchart("flowchart BT\nA --> B")).toThrow(
      new MermaidParseError("Only TD, TB, and LR flowchart directions are supported.", 1),
    );
  });

  it("rejects class assignments that reference unknown nodes", () => {
    expect(() => parseMermaidFlowchart("flowchart TD\nclass Missing primary")).toThrow(
      'Class assignment references unknown node "Missing".',
    );
  });

  it("normalizes classDef styling and class assignments", () => {
    const diagram = parseMermaidFlowchart(classStylingFlowchart);

    expect(diagram.styles).toEqual([
      {
        id: "primary",
        properties: {
          fill: "#ffffff",
          stroke: "#18a0fb",
          color: "#0d2a3f",
          "stroke-width": "2px",
        },
      },
      {
        id: "warning",
        properties: {
          fill: "#fff4cc",
          stroke: "#b7791f",
          color: "#3d2b00",
          "stroke-width": "3px",
        },
      },
    ]);
    expect(diagram.nodes.find((node) => node.id === "A")?.classIds).toEqual(["primary"]);
    expect(diagram.nodes.find((node) => node.id === "B")?.classIds).toEqual(["warning"]);
    expect(diagram.nodes.find((node) => node.id === "C")?.classIds).toEqual(["primary"]);
  });

  it("treats TB as a TD direction alias", () => {
    const diagram = parseMermaidFlowchart(`flowchart TB
      A[Start] --> B[Done]`);

    expect(diagram.direction).toBe("TD");
  });

  it("preserves quoted labels with punctuation and inline HTML-like content", () => {
    const diagram = parseMermaidFlowchart(`flowchart LR
      opk["<b>OPK</b><br/>Skills & knowledge-base mapping"]
      opk --> skills["Skills: prompt design, tools, QA"]`);

    expect(diagram.nodes.find((node) => node.id === "opk")?.label).toBe(
      "<b>OPK</b><br/>Skills & knowledge-base mapping",
    );
    expect(diagram.nodes.find((node) => node.id === "skills")?.label).toBe(
      "Skills: prompt design, tools, QA",
    );
    expect(diagram.edges).toHaveLength(1);
  });

  it("supports multiline quoted node labels", () => {
    const diagram = parseMermaidFlowchart(`flowchart TB
      kb["Knowledge base
with curated examples
and candidate branches"] --> future["Future branch
candidate node"]`);

    expect(diagram.nodes.find((node) => node.id === "kb")?.label).toBe(
      "Knowledge base\nwith curated examples\nand candidate branches",
    );
    expect(diagram.nodes.find((node) => node.id === "future")?.label).toBe(
      "Future branch\ncandidate node",
    );
  });

  it("expands fan-out edges with ampersand targets", () => {
    const diagram = parseMermaidFlowchart(`flowchart LR
      A["Central OPK map"] --> B["Skills"] & C["Knowledge base"] & D["Evaluation"]`);

    expect(diagram.edges).toEqual([
      expect.objectContaining({ from: "A", to: "B" }),
      expect.objectContaining({ from: "A", to: "C" }),
      expect.objectContaining({ from: "A", to: "D" }),
    ]);
  });

  it("supports subgraph declarations with readable titles", () => {
    const diagram = parseMermaidFlowchart(`flowchart TB
      subgraph Skills Layer
        A["Skill inventory"] --> B["Skill gaps"]
      end
      subgraph kb["Knowledge Base"]
        C["Source docs"] --> D["Reusable patterns"]
      end`);

    expect(diagram.subgraphs).toEqual([
      expect.objectContaining({
        id: "Skills_Layer",
        label: "Skills Layer",
        nodeIds: ["A", "B"],
      }),
      expect.objectContaining({
        id: "kb",
        label: "Knowledge Base",
        nodeIds: ["C", "D"],
      }),
    ]);
  });

  it("handles dense sibling branches under one parent", () => {
    const diagram = parseMermaidFlowchart(`flowchart TB
      root["Knowledge base map"] --> docs["Docs"] & prompts["Prompt examples"] & tools["Tools"] & qa["QA checks"] & future["Future candidates"]
      docs --> docsA["API notes"] & docsB["Plugin notes"] & docsC["Design notes"]
      future --> branchA["Candidate branch A"] & branchB["Candidate branch B"]`);

    expect(diagram.nodes).toHaveLength(11);
    expect(diagram.edges).toHaveLength(10);
    expect(diagram.nodes.find((node) => node.id === "future")?.label).toBe("Future candidates");
  });
});
