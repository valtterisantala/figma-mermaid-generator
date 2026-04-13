import { describe, expect, it } from "vitest";
import { classStylingFlowchart } from "../fixtures";
import { parseMermaidFlowchart } from "../core";
import { resolveNodeStyle } from "../main/styles";

describe("resolveNodeStyle", () => {
  it("maps v1 classDef properties onto node style", () => {
    const diagram = parseMermaidFlowchart(classStylingFlowchart);
    const start = diagram.nodes.find((node) => node.id === "A");

    expect(start).toBeDefined();

    const style = resolveNodeStyle(diagram, start!);

    expect(style.fill.color).toEqual({ r: 1, g: 1, b: 1 });
    expect(style.stroke.color).toEqual({
      r: 24 / 255,
      g: 160 / 255,
      b: 251 / 255,
    });
    expect(style.textFill.color).toEqual({
      r: 13 / 255,
      g: 42 / 255,
      b: 63 / 255,
    });
    expect(style.strokeWeight).toBe(2);
  });

  it("lets later classes override earlier classes narrowly", () => {
    const diagram = parseMermaidFlowchart(`flowchart TD
      A[Start]
      class A first
      class A second
      classDef first fill:#ffffff,stroke:#111111,color:#222222,stroke-width:1px
      classDef second fill:#eeeeee,stroke-width:4px`);
    const start = diagram.nodes[0];
    const style = resolveNodeStyle(diagram, start);

    expect(style.fill.color).toEqual({
      r: 238 / 255,
      g: 238 / 255,
      b: 238 / 255,
    });
    expect(style.stroke.color).toEqual({
      r: 17 / 255,
      g: 17 / 255,
      b: 17 / 255,
    });
    expect(style.strokeWeight).toBe(4);
  });
});
