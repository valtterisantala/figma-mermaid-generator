export type TextBoxEstimate = {
  height: number;
  lineCount: number;
  text: string;
  width: number;
};

export type TextRange = {
  end: number;
  start: number;
};

export type RenderedLabelText = {
  boldRanges: TextRange[];
  text: string;
};

const mermaidBreakPattern = /<br\s*\/?>/gi;
const labelMarkupPattern = /<br\s*\/?>|<\/?b>/gi;

export function normalizeMermaidLabelLineBreaks(label: string): string {
  return label.replace(mermaidBreakPattern, "\n");
}

export function renderMermaidLabelText(label: string): RenderedLabelText {
  const boldRanges: TextRange[] = [];
  let text = "";
  let cursor = 0;
  let boldDepth = 0;
  let boldStart = 0;

  for (const match of label.matchAll(labelMarkupPattern)) {
    const matchedText = match[0];
    const matchIndex = match.index ?? 0;

    text += label.slice(cursor, matchIndex);
    cursor = matchIndex + matchedText.length;

    if (/^<br/i.test(matchedText)) {
      text += "\n";
      continue;
    }

    if (/^<b>$/i.test(matchedText)) {
      if (boldDepth === 0) {
        boldStart = text.length;
      }

      boldDepth += 1;
      continue;
    }

    if (/^<\/b>$/i.test(matchedText) && boldDepth > 0) {
      boldDepth -= 1;

      if (boldDepth === 0 && text.length > boldStart) {
        boldRanges.push({
          start: boldStart,
          end: text.length,
        });
      }
    }
  }

  text += label.slice(cursor);

  if (boldDepth > 0 && text.length > boldStart) {
    boldRanges.push({
      start: boldStart,
      end: text.length,
    });
  }

  return {
    boldRanges,
    text,
  };
}

export function estimateMultilineTextBox(
  label: string,
  options: {
    fontSize: number;
    horizontalPadding: number;
    minHeight: number;
    minWidth: number;
    verticalPadding: number;
  },
): TextBoxEstimate {
  const text = renderMermaidLabelText(label).text;
  const lines = text.split("\n");
  const longestLineLength = Math.max(...lines.map((line) => line.length), 0);
  const lineHeight = Math.ceil(options.fontSize * 1.25);

  return {
    height: Math.max(options.minHeight, lines.length * lineHeight + options.verticalPadding),
    lineCount: lines.length,
    text,
    width: Math.max(
      options.minWidth,
      Math.ceil(longestLineLength * options.fontSize * 0.58) + options.horizontalPadding,
    ),
  };
}
