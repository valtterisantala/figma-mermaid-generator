export const subgraphFlowchart = `flowchart LR
  subgraph Input[Input checks]
    A[Start] --> B{Ready?}
  end
  B -->|Yes| C((Done))
  B -->|No| D[Revise input]`;
