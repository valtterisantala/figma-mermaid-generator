export const simpleGraph = `flowchart TD
  A[Start] --> B{Ready?}
  B -->|Yes| C((Done))
  B -->|No| D[Revise input]
  D --> B`;
