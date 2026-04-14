import { describe, expect, it } from "vitest";
import { buildOrthogonalPath, isOrthogonalPath, type NodeBox } from "../main/edge-routing";

const rectangle = (id: string, x: number, y: number): NodeBox => ({
  id,
  shape: "rectangle",
  x,
  y,
  width: 120,
  height: 60,
});

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
});
