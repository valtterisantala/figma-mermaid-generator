export const connectorCenteringLrFlowchart = `flowchart LR
  A[Single line]
  B[Multiline<br/>label<br/>node]
  C[This is a long wrapped label that should create a wider and taller rounded rectangle without shifting connector anchors]
  A --> B --> C`;

export const connectorCenteringTdFlowchart = `flowchart TD
  A[Single line]
  B[Multiline<br/>label<br/>node]
  C[This is a long wrapped label that should create a wider and taller rounded rectangle without shifting connector anchors]
  A --> B --> C`;

export const connectorCenteringSubgraphFlowchart = `flowchart LR
  subgraph Outer[Visible group]
    direction LR
    subgraph Col1[ ]
      direction TB
      A[Single line]
      B[Multiline<br/>label<br/>node]
    end
    subgraph Col2[ ]
      direction TB
      C[This is a long wrapped label that should create a wider and taller rounded rectangle]
    end
  end
  A --> B
  B --> C`;
