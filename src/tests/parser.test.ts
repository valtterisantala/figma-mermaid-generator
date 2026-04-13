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

  it("expands chained edge statements into sequential edges", () => {
    const diagram = parseMermaidFlowchart(`flowchart TD
      A[Plan] --> B[Build] --> C[Test] --> D[Ship]`);

    expect(diagram.edges).toEqual([
      expect.objectContaining({ from: "A", to: "B" }),
      expect.objectContaining({ from: "B", to: "C" }),
      expect.objectContaining({ from: "C", to: "D" }),
    ]);
  });

  it("keeps chained edges compatible with edge labels and fan-out targets", () => {
    const diagram = parseMermaidFlowchart(`flowchart LR
      A[Input] -->|normalize| B[Parser] & C[Validator] -->|publish| D[Model]`);

    expect(diagram.edges).toEqual([
      expect.objectContaining({ from: "A", to: "B", label: "normalize" }),
      expect.objectContaining({ from: "A", to: "C", label: "normalize" }),
      expect.objectContaining({ from: "B", to: "D", label: "publish" }),
      expect.objectContaining({ from: "C", to: "D", label: "publish" }),
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

  it("parses subgraph-local direction statements without halting", () => {
    const diagram = parseMermaidFlowchart(`flowchart TB
      subgraph R1[Research phase]
        direction LR
        A1[What AI does<br/>Line 2<br/>Line 3] --> A2[Output]
      end`);

    expect(diagram.subgraphs[0]).toMatchObject({
      id: "R1",
      direction: "LR",
      label: "Research phase",
      nodeIds: ["A1", "A2"],
    });
    expect(diagram.nodes.find((node) => node.id === "A1")?.label).toBe(
      "What AI does<br/>Line 2<br/>Line 3",
    );
  });

  it("supports edges to and from known subgraph ids without creating fake nodes", () => {
    const diagram = parseMermaidFlowchart(`flowchart LR
      H[Hub]
      subgraph R1[Research phase]
        A[Input] --> B[Output]
      end
      H --> R1
      R1 --> X[Next phase]`);

    expect(diagram.subgraphs.find((subgraph) => subgraph.id === "R1")).toBeDefined();
    expect(diagram.nodes.find((node) => node.id === "R1")).toBeUndefined();
    expect(diagram.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "H", to: "R1" }),
        expect.objectContaining({ from: "R1", to: "X" }),
      ]),
    );
  });

  it("converts forward subgraph id edge references when the subgraph is later declared", () => {
    const diagram = parseMermaidFlowchart(`flowchart LR
      H[Hub] --> R1
      subgraph R1[Research phase]
        A[Input] --> B[Output]
      end
      R1 --> X[Next phase]`);

    expect(diagram.subgraphs.find((subgraph) => subgraph.id === "R1")).toBeDefined();
    expect(diagram.nodes.find((node) => node.id === "R1")).toBeUndefined();
    expect(diagram.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "H", to: "R1" }),
        expect.objectContaining({ from: "R1", to: "X" }),
      ]),
    );
  });

  it("handles phase diagrams with subgraph directions, subgraph edges, and br labels", () => {
    const diagram = parseMermaidFlowchart(`flowchart TB
      Start[Start]

      subgraph P1[Phase 1: Discover]
        direction LR
        A1[Inventory<br/>skills<br/>knowledge] --> A2[Map gaps]
      end

      subgraph P2[Phase 2: Build]
        direction TD
        B1[Draft architecture] --> B2[Validate]
      end

      Start --> P1
      P1 --> P2
      P2 --> Done[Done]`);

    expect(diagram.subgraphs.map((subgraph) => subgraph.direction)).toEqual(["LR", "TD"]);
    expect(diagram.nodes.find((node) => node.id === "A1")?.label).toBe(
      "Inventory<br/>skills<br/>knowledge",
    );
    expect(diagram.nodes.find((node) => node.id === "P1")).toBeUndefined();
    expect(diagram.nodes.find((node) => node.id === "P2")).toBeUndefined();
    expect(diagram.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "Start", to: "P1" }),
        expect.objectContaining({ from: "P1", to: "P2" }),
        expect.objectContaining({ from: "P2", to: "Done" }),
      ]),
    );
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

  it("handles dense fan-out and sibling branches across blank sections", () => {
    const diagram = parseMermaidFlowchart(`flowchart TB
      root["Architecture map"] --> api["API"] & worker["Worker"] & ui["Plugin UI"] & data["Knowledge base"]

      api --> routes["Routes"] & auth["Auth"] & errors["Errors"]

      worker --> parse["Parse"] & normalize["Normalize"] & layout["Layout"] & render["Render"]

      data --> current["Current docs"] & future["Future candidates"] & review["Review queue"]`);

    expect(diagram.nodes).toHaveLength(15);
    expect(diagram.edges).toHaveLength(14);
  });

  it("fails malformed fan-out statements with a specific message", () => {
    expect(() => parseMermaidFlowchart("flowchart TD\nA --> B &")).toThrow(
      "Fan-out edge list contains an empty node reference.",
    );
  });

  it("fails unrelated Mermaid diagram families with a specific message", () => {
    expect(() => parseMermaidFlowchart("sequenceDiagram\nA->>B: Hello")).toThrow(
      'Unsupported Mermaid diagram type "sequenceDiagram".',
    );
  });

  it("handles a practical OPK and skills map with chains, groups, and long labels", () => {
    const diagram = parseMermaidFlowchart(`flowchart LR
      OPK["<b>OPK</b><br/>Operating knowledge map"] --> Skills["Skills inventory<br/>Prompting, tools, review"] --> KB["Knowledge base<br/>Reusable examples"]

      subgraph R1[Skill development phase]
        direction LR
        Skills --> Prompting["Prompt design"] & Tooling["Tool use"] & QA["Quality checks"]
      end

      KB --> Current["Current source notes"] & Future["Future branch candidates"] & Gaps["Known gaps"]`);

    expect(diagram.nodes.find((node) => node.id === "OPK")?.label).toBe(
      "<b>OPK</b><br/>Operating knowledge map",
    );
    expect(diagram.subgraphs.find((subgraph) => subgraph.id === "R1")?.direction).toBe("LR");
    expect(diagram.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "OPK", to: "Skills" }),
        expect.objectContaining({ from: "Skills", to: "KB" }),
        expect.objectContaining({ from: "Skills", to: "Prompting" }),
        expect.objectContaining({ from: "KB", to: "Future" }),
      ]),
    );
  });

  it("handles a dense phase-style AI workflow map", () => {
    const diagram = parseMermaidFlowchart(`flowchart TB
      Intake["Intake<br/>Goals, constraints, source docs"] --> Plan["Plan architecture"] --> Build["Build native plugin output"] --> Review["Review and polish"]

      subgraph Phase1[Phase 1: Understand]
        direction LR
        Intake --> Context["Collect context"] & Risks["Identify risky assumptions"] & Scope["Keep flowchart-only scope"]
      end

      subgraph Phase2[Phase 2: Implement]
        direction TD
        Plan --> Parser["Parser normalization"] & Layout["Layout pass"] & Render["Native Figma render"]
        Parser --> Tests["Focused parser tests"] --> Review
      end

      Review --> Ship["Ready for practical architecture, process, and knowledge maps"]`);

    expect(diagram.subgraphs.map((subgraph) => subgraph.direction)).toEqual(["LR", "TD"]);
    expect(diagram.nodes.find((node) => node.id === "Intake")?.label).toBe(
      "Intake<br/>Goals, constraints, source docs",
    );
    expect(diagram.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "Intake", to: "Plan" }),
        expect.objectContaining({ from: "Plan", to: "Build" }),
        expect.objectContaining({ from: "Build", to: "Review" }),
        expect.objectContaining({ from: "Tests", to: "Review" }),
      ]),
    );
  });
});
