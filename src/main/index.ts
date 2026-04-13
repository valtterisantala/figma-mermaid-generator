figma.showUI(__html__, {
  width: 360,
  height: 240,
  themeColors: true,
});

figma.ui.postMessage({
  type: "plugin-ready",
  message: "Mermaid Native Generator is ready.",
});
