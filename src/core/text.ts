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

type RenderLabelOptions = {
  fontSize?: number;
  maxWidth?: number;
};

const mermaidBreakPattern = /<br\s*\/?>/gi;
const labelMarkupPattern = /<br\s*\/?>|<\/?b>/gi;

export function normalizeMermaidLabelLineBreaks(label: string): string {
  return label.replace(mermaidBreakPattern, "\n");
}

export function renderMermaidLabelText(
  label: string,
  options: RenderLabelOptions = {},
): RenderedLabelText {
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

  const rendered = {
    boldRanges,
    text,
  };

  if (!options.maxWidth || !options.fontSize) {
    return rendered;
  }

  return wrapRenderedLabelText(rendered, options.fontSize, options.maxWidth);
}

export function estimateMultilineTextBox(
  label: string,
  options: {
    fontSize: number;
    horizontalPadding: number;
    maxTextWidth?: number;
    minHeight: number;
    minWidth: number;
    verticalPadding: number;
  },
): TextBoxEstimate {
  const text = renderMermaidLabelText(label, {
    fontSize: options.fontSize,
    maxWidth: options.maxTextWidth,
  }).text;
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

function wrapRenderedLabelText(
  rendered: RenderedLabelText,
  fontSize: number,
  maxWidth: number,
): RenderedLabelText {
  const maxChars = Math.max(1, Math.floor(maxWidth / estimateCharacterWidth(fontSize)));

  if (maxChars <= 1) {
    return rendered;
  }

  const boldMask = createBoldMask(rendered);
  const wrappedTextParts: string[] = [];
  const wrappedBoldMask: boolean[] = [];
  const paragraphs = rendered.text.split("\n");
  let originalIndex = 0;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const wrappedLines = wrapParagraph(paragraph, maxChars);

    wrappedLines.forEach((line) => {
      if (wrappedTextParts.length > 0) {
        wrappedTextParts.push("\n");
        wrappedBoldMask.push(false);
      }

      for (let index = 0; index < line.text.length; index += 1) {
        const absoluteIndex = originalIndex + line.sourceIndices[index];
        wrappedTextParts.push(line.text[index]);
        wrappedBoldMask.push(boldMask[absoluteIndex] ?? false);
      }
    });

    originalIndex += paragraph.length;

    if (paragraphIndex < paragraphs.length - 1) {
      originalIndex += 1;
    }
  });

  return {
    text: wrappedTextParts.join(""),
    boldRanges: buildBoldRanges(wrappedBoldMask),
  };
}

function wrapParagraph(
  paragraph: string,
  maxChars: number,
): Array<{ sourceIndices: number[]; text: string }> {
  if (paragraph.length <= maxChars) {
    return [
      {
        text: paragraph,
        sourceIndices: Array.from({ length: paragraph.length }, (_value, index) => index),
      },
    ];
  }

  const lines: Array<{ sourceIndices: number[]; text: string }> = [];
  let start = 0;

  while (start < paragraph.length) {
    while (paragraph[start] === " ") {
      start += 1;
    }

    if (start >= paragraph.length) {
      break;
    }

    const remaining = paragraph.length - start;
    if (remaining <= maxChars) {
      lines.push(createWrappedLine(paragraph, start, paragraph.length));
      break;
    }

    const limit = start + maxChars;
    let breakIndex = -1;

    for (let index = limit; index > start; index -= 1) {
      if (/\s/.test(paragraph[index])) {
        breakIndex = index;
        break;
      }
    }

    if (breakIndex === -1 || breakIndex === start) {
      lines.push(createWrappedLine(paragraph, start, limit));
      start = limit;
      continue;
    }

    lines.push(createWrappedLine(paragraph, start, breakIndex));
    start = breakIndex + 1;
  }

  return lines;
}

function createWrappedLine(
  paragraph: string,
  start: number,
  end: number,
): { sourceIndices: number[]; text: string } {
  const trimmedEnd = trimTrailingWhitespace(paragraph, start, end);
  const sourceIndices: number[] = [];
  let text = "";

  for (let index = start; index < trimmedEnd; index += 1) {
    text += paragraph[index];
    sourceIndices.push(index);
  }

  return {
    text,
    sourceIndices,
  };
}

function trimTrailingWhitespace(paragraph: string, start: number, end: number): number {
  let trimmedEnd = end;

  while (trimmedEnd > start && /\s/.test(paragraph[trimmedEnd - 1])) {
    trimmedEnd -= 1;
  }

  return trimmedEnd;
}

function createBoldMask(rendered: RenderedLabelText): boolean[] {
  const mask = Array.from({ length: rendered.text.length }, () => false);

  for (const range of rendered.boldRanges) {
    for (let index = range.start; index < range.end; index += 1) {
      mask[index] = true;
    }
  }

  return mask;
}

function buildBoldRanges(mask: boolean[]): TextRange[] {
  const ranges: TextRange[] = [];
  let start = -1;

  for (let index = 0; index <= mask.length; index += 1) {
    const isBold = mask[index] ?? false;

    if (isBold && start === -1) {
      start = index;
      continue;
    }

    if (!isBold && start !== -1) {
      ranges.push({ start, end: index });
      start = -1;
    }
  }

  return ranges;
}

function estimateCharacterWidth(fontSize: number): number {
  return fontSize * 0.58;
}
