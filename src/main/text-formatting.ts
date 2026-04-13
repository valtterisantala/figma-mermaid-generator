import { renderMermaidLabelText, type RenderedLabelText } from "../core";

type TextFormattingOptions = {
  baseFontName: FontName;
  boldFontName: FontName;
  fontSize: number;
  maxWidth?: number;
};

export function applyMermaidLabelToTextNode(
  textNode: TextNode,
  label: string,
  options: TextFormattingOptions,
): RenderedLabelText {
  const rendered = renderMermaidLabelText(label, {
    fontSize: options.fontSize,
    maxWidth: options.maxWidth,
  });

  textNode.fontName = options.baseFontName;
  textNode.characters = rendered.text;

  for (const range of rendered.boldRanges) {
    textNode.setRangeFontName(range.start, range.end, options.boldFontName);
  }

  return rendered;
}
