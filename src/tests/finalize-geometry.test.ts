import { describe, expect, it } from "vitest";
import {
  choosePackingRowsForTest,
  getSubgraphContentFrameSizeForTest,
  shouldSkipFinalPackingForTest,
} from "../main/finalize-geometry";
import { defaultPresentationLayoutSettings } from "../main/render";
import { fullConnectorStressFlowchart } from "../fixtures";
import { parseMermaidFlowchart } from "../core";

describe("final geometry packing", () => {
  it("chooses a non-row packing for three tall blocks that would create a wide strip", () => {
    const rows = choosePackingRowsForTest(
      [
        { id: "Current", x: 0, y: 0, width: 600, height: 680 },
        { id: "Local", x: 664, y: 0, width: 600, height: 680 },
        { id: "Hybrid", x: 1328, y: 0, width: 600, height: 680 },
      ],
      {
        ...defaultPresentationLayoutSettings,
        layoutTarget: "slide-16-9",
      },
      [0, 0, 0],
    );

    expect(new Set(rows).size).toBeGreaterThan(1);
  });

  it("shrinks subgraph frames to node/title content instead of preserving edge-inflated size", () => {
    const size = getSubgraphContentFrameSizeForTest(
      { x: 0, y: 0, width: 1200, height: 900 },
      { x: 32, y: 28, width: 320, height: 180 },
    );

    expect(size).toEqual({
      width: 384,
      height: 240,
    });
  });

  it("skips final repacking for source-ordered LR subgraph chains after edges are rendered", () => {
    const diagram = parseMermaidFlowchart(fullConnectorStressFlowchart);

    expect(
      shouldSkipFinalPackingForTest(diagram, [
        { id: "Channel", x: 0, y: 0, width: 240, height: 140 },
        { id: "Orchestration", x: 280, y: 0, width: 420, height: 140 },
        { id: "Engine", x: 740, y: 0, width: 720, height: 140 },
        { id: "Outputs", x: 1500, y: 0, width: 260, height: 420 },
      ]),
    ).toBe(true);
  });
});
