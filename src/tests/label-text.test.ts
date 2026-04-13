import { describe, expect, it } from "vitest";
import {
  estimateMultilineTextBox,
  normalizeMermaidLabelLineBreaks,
  renderMermaidLabelText,
} from "../main/label-text";

describe("label text rendering helpers", () => {
  it("converts self-closing Mermaid br tags into newlines", () => {
    expect(normalizeMermaidLabelLineBreaks("What AI does<br/>Line 2")).toBe("What AI does\nLine 2");
  });

  it("converts non-self-closing Mermaid br tags into newlines", () => {
    expect(normalizeMermaidLabelLineBreaks("Phase 1<br>Phase 2")).toBe("Phase 1\nPhase 2");
  });

  it("converts multiple break markers in one label", () => {
    expect(normalizeMermaidLabelLineBreaks("A<br/>B<br>C")).toBe("A\nB\nC");
  });

  it("strips bold tags while preserving bold text ranges", () => {
    expect(renderMermaidLabelText("Alpha <b>Beta</b> Gamma")).toEqual({
      text: "Alpha Beta Gamma",
      boldRanges: [{ start: 6, end: 10 }],
    });
  });

  it("keeps line breaks and bold ranges aligned together", () => {
    expect(renderMermaidLabelText("<b>Title</b><br/>Line 2")).toEqual({
      text: "Title\nLine 2",
      boldRanges: [{ start: 0, end: 5 }],
    });
  });

  it("estimates multiline text boxes from rendered lines instead of literal br text", () => {
    const box = estimateMultilineTextBox("Alpha<br/>Beta<br>Gamma", {
      fontSize: 13,
      horizontalPadding: 16,
      minHeight: 22,
      minWidth: 36,
      verticalPadding: 10,
    });

    expect(box.text).toBe("Alpha\nBeta\nGamma");
    expect(box.lineCount).toBe(3);
    expect(box.height).toBeGreaterThan(22);
    expect(box.width).toBeLessThan(120);
  });

  it("estimates text boxes from rendered bold-free text instead of literal tags", () => {
    const plain = estimateMultilineTextBox("Alpha Beta", {
      fontSize: 13,
      horizontalPadding: 16,
      minHeight: 22,
      minWidth: 36,
      verticalPadding: 10,
    });
    const boldMarkup = estimateMultilineTextBox("Alpha <b>Beta</b>", {
      fontSize: 13,
      horizontalPadding: 16,
      minHeight: 22,
      minWidth: 36,
      verticalPadding: 10,
    });

    expect(boldMarkup.text).toBe("Alpha Beta");
    expect(boldMarkup.width).toBe(plain.width);
  });
});
