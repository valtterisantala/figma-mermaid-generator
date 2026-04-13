import type { DiagramModel, DiagramNode, DiagramStyle } from "../core";

export type ResolvedNodeStyle = {
  fill: SolidPaint;
  stroke: SolidPaint;
  textFill: SolidPaint;
  strokeWeight: number;
};

const defaultNodeStyle: ResolvedNodeStyle = {
  fill: { type: "SOLID", color: { r: 1, g: 1, b: 1 } },
  stroke: { type: "SOLID", color: { r: 0.28, g: 0.32, b: 0.38 } },
  textFill: { type: "SOLID", color: { r: 0.1, g: 0.11, b: 0.13 } },
  strokeWeight: 1,
};

export function resolveNodeStyle(diagram: DiagramModel, node: DiagramNode): ResolvedNodeStyle {
  const stylesById = new Map(diagram.styles.map((style) => [style.id, style]));

  return node.classIds.reduce<ResolvedNodeStyle>((resolvedStyle, classId) => {
    const style = stylesById.get(classId);

    if (!style) {
      return resolvedStyle;
    }

    return applyDiagramStyle(resolvedStyle, style);
  }, cloneNodeStyle(defaultNodeStyle));
}

function applyDiagramStyle(baseStyle: ResolvedNodeStyle, style: DiagramStyle): ResolvedNodeStyle {
  const nextStyle = cloneNodeStyle(baseStyle);
  const properties = normalizeProperties(style.properties);
  const fill = parseColor(properties.fill);
  const stroke = parseColor(properties.stroke);
  const textFill = parseColor(properties.color ?? properties["text-color"]);
  const strokeWeight = parseStrokeWeight(properties["stroke-width"] ?? properties.strokewidth);

  if (fill) {
    nextStyle.fill = fill;
  }

  if (stroke) {
    nextStyle.stroke = stroke;
  }

  if (textFill) {
    nextStyle.textFill = textFill;
  }

  if (strokeWeight !== null) {
    nextStyle.strokeWeight = strokeWeight;
  }

  return nextStyle;
}

function normalizeProperties(properties: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

function parseColor(value: string | undefined): SolidPaint | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (!hex) {
    return null;
  }

  const expanded =
    hex[1].length === 3
      ? hex[1]
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : hex[1];
  const red = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const green = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(expanded.slice(4, 6), 16) / 255;

  return {
    type: "SOLID",
    color: {
      r: red,
      g: green,
      b: blue,
    },
  };
}

function parseStrokeWeight(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/px$/i, "");
  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function cloneNodeStyle(style: ResolvedNodeStyle): ResolvedNodeStyle {
  return {
    fill: clonePaint(style.fill),
    stroke: clonePaint(style.stroke),
    textFill: clonePaint(style.textFill),
    strokeWeight: style.strokeWeight,
  };
}

function clonePaint(paint: SolidPaint): SolidPaint {
  return {
    ...paint,
    color: {
      ...paint.color,
    },
  };
}
