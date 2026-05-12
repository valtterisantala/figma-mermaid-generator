import { describe, expect, it } from "vitest";
import { basicFlowchart } from "../fixtures/basic-flowchart";
import { runtimeHostingArchitectureComparison } from "../fixtures";
import { estimateMultilineTextBox, layoutDiagram, parseMermaidFlowchart } from "../core";
import { addVisibleSubgraphSpacingForTest } from "../main/render";

const repeatedPhaseFixture = `flowchart LR

  P1["<b>Early phase</b>"]
  H1["<b>Human role</b><br/>Defines the problem<br/>Challenges assumptions<br/>Selects direction"]
  A1["<b>AI support</b><br/>Structures material<br/>Surfaces gaps<br/>Generates alternatives"]
  O1["<b>Output</b><br/>Clearer brief<br/>Faster concepting<br/>Better alignment"]

  P2["<b>Build phase</b>"]
  H2["<b>Human role</b><br/>Makes architecture decisions<br/>Reviews quality<br/>Prioritises what ships"]
  A2["<b>AI support</b><br/>Assists with code generation<br/>Supports implementation work<br/>Helps with testing and documentation"]
  O2["<b>Output</b><br/>Faster iteration<br/>More time for high-value decisions<br/>Better-supported delivery"]

  P3["<b>Live phase</b>"]
  H3["<b>Human role</b><br/>Defines boundaries<br/>Evaluates usefulness<br/>Improves based on real use"]
  A3["<b>AI support</b><br/>Powers services<br/>Supports workflows<br/>Helps process feedback"]
  O3["<b>Output</b><br/>More useful services<br/>Better continuity<br/>Continuous improvement"]

  P1 --> H1
  P1 --> A1
  H1 --> O1
  A1 --> O1

  O1 --> P2
  P2 --> H2
  P2 --> A2
  H2 --> O2
  A2 --> O2

  O2 --> P3
  P3 --> H3
  P3 --> A3
  H3 --> O3
  A3 --> O3`;

const repeatedParallelStageFixture = `flowchart LR
  A["Drone registration"]
  B["Flight session starts"]
  A1["Airspace review"] 
  A2["Weather check"]
  A3["Battery check"]
  A4["Firmware check"]
  A5["Sensor calibration"]
  A6["Mission checklist"]
  A7["Geofence validation"]
  A8["Pilot confirmation"]
  A9["Safety acknowledgement"]

  A --> A1 --> B
  A --> A2 --> B
  A --> A3 --> B
  A --> A4 --> B
  A --> A5 --> B
  A --> A6 --> B
  A --> A7 --> B
  A --> A8 --> B
  A --> A9 --> B`;

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

  it("lays out edges that connect to known subgraph ids", () => {
    const diagram = parseMermaidFlowchart(`flowchart LR
      H[Hub]
      subgraph R1[Research phase]
        A[Input] --> B[Output]
      end
      H --> R1
      R1 --> X[Next]`);
    const layout = layoutDiagram(diagram);

    expect(layout.nodes.find((node) => node.id === "R1")).toBeUndefined();
    expect(layout.subgraphs.find((subgraph) => subgraph.id === "R1")).toBeDefined();
    expect(layout.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringContaining("_H_to_R1"),
          points: expect.arrayContaining([
            expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
          ]),
        }),
        expect.objectContaining({
          id: expect.stringContaining("_R1_to_X"),
          points: expect.arrayContaining([
            expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
          ]),
        }),
      ]),
    );
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

  it("sizes multiline nodes from the longest rendered line instead of raw br text length", () => {
    const singleLine = parseMermaidFlowchart(`flowchart TD
      A[What AI does Line 2 Line 3]`);
    const multiline = parseMermaidFlowchart(`flowchart TD
      A[What AI does<br/>Line 2<br/>Line 3]`);

    const singleLayout = layoutDiagram(singleLine);
    const multilineLayout = layoutDiagram(multiline);
    const singleNode = singleLayout.nodes.find((node) => node.id === "A");
    const multilineNode = multilineLayout.nodes.find((node) => node.id === "A");

    expect(singleNode).toBeDefined();
    expect(multilineNode).toBeDefined();
    expect(multilineNode?.width).toBeLessThan(singleNode?.width ?? 0);
    expect(multilineNode?.height).toBeGreaterThan(singleNode?.height ?? 0);
  });

  it("grows node height with rendered line count", () => {
    const twoLines = parseMermaidFlowchart(`flowchart TD
      A[Alpha<br/>Beta]`);
    const fourLines = parseMermaidFlowchart(`flowchart TD
      A[Alpha<br/>Beta<br/>Gamma<br/>Delta]`);

    const twoLineNode = layoutDiagram(twoLines).nodes.find((node) => node.id === "A");
    const fourLineNode = layoutDiagram(fourLines).nodes.find((node) => node.id === "A");

    expect(fourLineNode?.height).toBeGreaterThan(twoLineNode?.height ?? 0);
  });

  it("uses the longest rendered line for multiline width estimates", () => {
    const box = estimateMultilineTextBox("Short<br/>Longest rendered line<br/>Mid", {
      fontSize: 13,
      horizontalPadding: 32,
      minHeight: 56,
      minWidth: 112,
      verticalPadding: 20,
    });

    const shortLineBox = estimateMultilineTextBox("Short", {
      fontSize: 13,
      horizontalPadding: 32,
      minHeight: 56,
      minWidth: 112,
      verticalPadding: 20,
    });

    expect(box.lineCount).toBe(3);
    expect(box.width).toBeGreaterThan(shortLineBox.width);
    expect(box.width).toBe(
      estimateMultilineTextBox("Longest rendered line", {
        fontSize: 13,
        horizontalPadding: 32,
        minHeight: 56,
        minWidth: 112,
        verticalPadding: 20,
      }).width,
    );
  });

  it("sizes multiline edge labels from rendered lines", () => {
    const singleLine = parseMermaidFlowchart(`flowchart LR
      A -->|Alpha Beta Gamma| B`);
    const multiline = parseMermaidFlowchart(`flowchart LR
      A -->|Alpha<br/>Beta<br/>Gamma| B`);

    const singleEdge = layoutDiagram(singleLine).edges[0];
    const multilineEdge = layoutDiagram(multiline).edges[0];

    expect(singleEdge.labelPosition).toBeDefined();
    expect(multilineEdge.labelPosition).toBeDefined();

    const singleBox = estimateMultilineTextBox("Alpha Beta Gamma", {
      fontSize: 12,
      horizontalPadding: 20,
      minHeight: 24,
      minWidth: 20,
      verticalPadding: 8,
    });
    const multilineBox = estimateMultilineTextBox("Alpha<br/>Beta<br/>Gamma", {
      fontSize: 12,
      horizontalPadding: 20,
      minHeight: 24,
      minWidth: 20,
      verticalPadding: 8,
    });

    expect(multilineBox.width).toBeLessThan(singleBox.width);
    expect(multilineBox.height).toBeGreaterThan(singleBox.height);
  });

  it("wraps long box-like node labels instead of growing width indefinitely", () => {
    const diagram = parseMermaidFlowchart(`flowchart TD
      A[This is a very long architecture label that should wrap instead of stretching the node far across the canvas]`);
    const layout = layoutDiagram(diagram);
    const node = layout.nodes.find((entry) => entry.id === "A");

    expect(node).toBeDefined();
    expect(node?.width).toBeLessThanOrEqual(252);
    expect(node?.height).toBeGreaterThan(56);
  });

  it("keeps explicit Mermaid line breaks working alongside automatic wrapping", () => {
    const diagram = parseMermaidFlowchart(`flowchart TD
      A[Overview<br/>This is a long explanatory sentence that should still wrap within the node width cap]`);
    const layout = layoutDiagram(diagram);
    const node = layout.nodes.find((entry) => entry.id === "A");
    const estimated = estimateMultilineTextBox(
      "Overview<br/>This is a long explanatory sentence that should still wrap within the node width cap",
      {
        fontSize: 13,
        horizontalPadding: 32,
        maxTextWidth: 220,
        minHeight: 56,
        minWidth: 112,
        verticalPadding: 20,
      },
    );

    expect(node).toBeDefined();
    expect(estimated.text.split("\n").length).toBeGreaterThanOrEqual(3);
    expect(node?.width).toBeLessThanOrEqual(252);
    expect(node?.height).toBe(estimated.height);
  });

  it("keeps repeated LR phase motifs in a consistent middle-node column", () => {
    const diagram = parseMermaidFlowchart(repeatedPhaseFixture);
    const layout = layoutDiagram(diagram);
    const phaseGroups: Array<[string, string, string]> = [
      ["H1", "A1", "O1"],
      ["H2", "A2", "O2"],
      ["H3", "A3", "O3"],
    ];

    for (const [humanId, aiId, outputId] of phaseGroups) {
      const human = layout.nodes.find((node) => node.id === humanId);
      const ai = layout.nodes.find((node) => node.id === aiId);
      const output = layout.nodes.find((node) => node.id === outputId);

      expect(human).toBeDefined();
      expect(ai).toBeDefined();
      expect(output).toBeDefined();
      expect((human?.x ?? 0) + (human?.width ?? 0)).toBe((ai?.x ?? 0) + (ai?.width ?? 0));
      expect(output?.x).toBeGreaterThan(Math.max(human?.x ?? 0, ai?.x ?? 0));
    }
  });

  it("leaves the repeated phase motif vertical in TD diagrams", () => {
    const diagram = parseMermaidFlowchart(
      repeatedPhaseFixture.replace("flowchart LR", "flowchart TD"),
    );
    const layout = layoutDiagram(diagram);
    const phase = layout.nodes.find((node) => node.id === "P1");
    const human = layout.nodes.find((node) => node.id === "H1");
    const ai = layout.nodes.find((node) => node.id === "A1");
    const output = layout.nodes.find((node) => node.id === "O1");

    expect(phase).toBeDefined();
    expect(human).toBeDefined();
    expect(ai).toBeDefined();
    expect(output).toBeDefined();
    expect(human?.y).toBeGreaterThan(phase?.y ?? 0);
    expect(ai?.y).toBeGreaterThan(phase?.y ?? 0);
    expect(output?.y).toBeGreaterThan(Math.min(human?.y ?? 0, ai?.y ?? 0));
  });

  it("keeps repeated LR parallel-stage middle nodes in one shared column", () => {
    const diagram = parseMermaidFlowchart(repeatedParallelStageFixture);
    const layout = layoutDiagram(diagram);
    const source = layout.nodes.find((node) => node.id === "A");
    const target = layout.nodes.find((node) => node.id === "B");
    const middleNodes = layout.nodes
      .filter((node) => /^A[1-9]$/.test(node.id))
      .sort((left, right) => left.id.localeCompare(right.id));

    expect(source).toBeDefined();
    expect(target).toBeDefined();
    expect(middleNodes).toHaveLength(9);

    const centerXs = middleNodes.map((node) => node.x + node.width / 2);
    const firstCenter = centerXs[0];

    for (const centerX of centerXs) {
      expect(centerX).toBe(firstCenter);
    }

    const sourceRight = (source?.x ?? 0) + (source?.width ?? 0);
    const targetLeft = target?.x ?? 0;
    expect(firstCenter).toBeGreaterThan(sourceRight);
    expect(firstCenter).toBeLessThan(targetLeft);

    const middleOrderByY = [...middleNodes]
      .sort((left, right) => left.y - right.y)
      .map((node) => node.id);
    expect(middleOrderByY).toEqual(["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"]);
  });

  it("preserves declared top-to-bottom lane order in equivalent LR comparison subgraphs", () => {
    const diagram = parseMermaidFlowchart(runtimeHostingArchitectureComparison);
    const layout = layoutDiagram(diagram);
    const yByNodeId = new Map(layout.nodes.map((node) => [node.id, node.y]));

    const expectTopBeforeBottom = (topId: string, bottomId: string) => {
      expect(yByNodeId.get(topId)).toBeLessThan(
        yByNodeId.get(bottomId) ?? Number.POSITIVE_INFINITY,
      );
    };

    expectTopBeforeBottom("currControl", "currVercel");
    expectTopBeforeBottom("currClient", "currAbly");
    expectTopBeforeBottom("currDisplay", "currStrapi");
    expectTopBeforeBottom("localControl", "localServer");
    expectTopBeforeBottom("localClient", "localAbly");
    expectTopBeforeBottom("localDisplay", "localStrapi");
    expectTopBeforeBottom("hybridControl", "hybridServer");
    expectTopBeforeBottom("hybridClient", "hybridBus");
    expectTopBeforeBottom("hybridDisplay", "hybridStrapi");
  });

  it("adds render-time spacing between stacked visible top-level subgraphs", () => {
    const diagram = parseMermaidFlowchart(`flowchart TB
      subgraph First[First group]
        A[Alpha] --> B[Beta]
      end
      subgraph Second[Second group]
        C[Gamma] --> D[Delta]
      end`);
    const layout = {
      nodes: [
        { id: "A", x: 20, y: 20, width: 100, height: 56 },
        { id: "B", x: 160, y: 20, width: 100, height: 56 },
        { id: "C", x: 20, y: 130, width: 100, height: 56 },
        { id: "D", x: 160, y: 130, width: 100, height: 56 },
      ],
      edges: [
        {
          id: "edge_1_A_to_B",
          points: [
            { x: 120, y: 48 },
            { x: 160, y: 48 },
          ],
        },
        {
          id: "edge_2_C_to_D",
          points: [
            { x: 120, y: 158 },
            { x: 160, y: 158 },
          ],
        },
      ],
      subgraphs: [
        { id: "First", x: 0, y: 0, width: 280, height: 110 },
        { id: "Second", x: 0, y: 112, width: 280, height: 110 },
      ],
    };
    const adjusted = addVisibleSubgraphSpacingForTest(
      diagram,
      layout,
      new Map([
        ["First", 28],
        ["Second", 28],
      ]),
    );
    const first = adjusted.subgraphs.find((subgraph) => subgraph.id === "First");
    const second = adjusted.subgraphs.find((subgraph) => subgraph.id === "Second");
    const movedNode = adjusted.nodes.find((node) => node.id === "C");
    const movedEdge = adjusted.edges.find((edge) => edge.id === "edge_2_C_to_D");

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect((second?.y ?? 0) - ((first?.y ?? 0) + (first?.height ?? 0) + 28)).toBeGreaterThanOrEqual(
      28,
    );
    expect(movedNode?.y).toBeGreaterThan(130);
    expect(movedEdge?.points[0].y).toBeGreaterThan(158);
  });

  it("packs visible top-level LR subgraphs horizontally in declaration order", () => {
    const diagram = parseMermaidFlowchart(`flowchart LR
      subgraph First[First group]
        A[Alpha] --> B[Beta]
      end
      subgraph Second[Second group]
        C[Gamma] --> D[Delta]
      end`);
    const layout = {
      nodes: [
        { id: "A", x: 320, y: 420, width: 100, height: 56 },
        { id: "B", x: 460, y: 420, width: 100, height: 56 },
        { id: "C", x: 20, y: 40, width: 100, height: 56 },
        { id: "D", x: 160, y: 40, width: 100, height: 56 },
      ],
      edges: [
        {
          id: "edge_1_A_to_B",
          points: [
            { x: 420, y: 448 },
            { x: 460, y: 448 },
          ],
        },
        {
          id: "edge_2_C_to_D",
          points: [
            { x: 120, y: 68 },
            { x: 160, y: 68 },
          ],
        },
      ],
      subgraphs: [
        { id: "First", x: 300, y: 400, width: 280, height: 110 },
        { id: "Second", x: 0, y: 0, width: 280, height: 110 },
      ],
    };
    const adjusted = addVisibleSubgraphSpacingForTest(
      diagram,
      layout,
      new Map([
        ["First", 28],
        ["Second", 28],
      ]),
    );
    const first = adjusted.subgraphs.find((subgraph) => subgraph.id === "First");
    const second = adjusted.subgraphs.find((subgraph) => subgraph.id === "Second");
    const movedNode = adjusted.nodes.find((node) => node.id === "C");
    const movedEdge = adjusted.edges.find((edge) => edge.id === "edge_2_C_to_D");

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first?.x).toBe(0);
    expect(first?.y).toBe(0);
    expect(second?.x).toBe((first?.x ?? 0) + (first?.width ?? 0) + 28);
    expect(second?.y).toBe(first?.y);
    expect(movedNode?.x).toBeGreaterThan(320);
    expect(movedNode?.y).toBe(40);
    expect(movedEdge?.points[0].x).toBeGreaterThan(400);
    expect(movedEdge?.points[0].y).toBe(68);
  });

  it("packs comparable TB subgraphs horizontally in slide 16:9 mode", () => {
    const diagram = parseMermaidFlowchart(`flowchart TB
      subgraph Current[Current architecture]
        direction LR
        subgraph currentCol1[ ]
          direction TB
          A1[Top lane]
          A2[Bottom lane]
        end
      end
      subgraph Proposed[Proposed architecture]
        direction LR
        subgraph proposedCol1[ ]
          direction TB
          B1[Top lane]
          B2[Bottom lane]
        end
      end`);
    const layout = {
      nodes: [
        { id: "A1", x: 20, y: 20, width: 100, height: 56 },
        { id: "A2", x: 20, y: 100, width: 100, height: 56 },
        { id: "B1", x: 20, y: 280, width: 100, height: 56 },
        { id: "B2", x: 20, y: 360, width: 100, height: 56 },
      ],
      edges: [],
      subgraphs: [
        { id: "currentCol1", x: 0, y: 0, width: 160, height: 180 },
        { id: "Current", x: -20, y: -20, width: 200, height: 220 },
        { id: "proposedCol1", x: 0, y: 260, width: 160, height: 180 },
        { id: "Proposed", x: -20, y: 240, width: 200, height: 220 },
      ],
    };
    const adjusted = addVisibleSubgraphSpacingForTest(
      diagram,
      layout,
      new Map([
        ["Current", 28],
        ["Proposed", 28],
      ]),
      {
        layoutTarget: "slide-16-9",
      },
    );
    const current = adjusted.subgraphs.find((subgraph) => subgraph.id === "Current");
    const proposed = adjusted.subgraphs.find((subgraph) => subgraph.id === "Proposed");

    expect(proposed?.x).toBe((current?.x ?? 0) + (current?.width ?? 0) + 28);
    expect(proposed?.y).toBe(current?.y);
  });
});
