export const classStylingFlowchart = `flowchart TD
  A[Start] --> B{Ready?}
  B -->|Yes| C((Done))
  B -->|No| D[Revise input]
  class A,C primary
  class B warning
  classDef primary fill:#ffffff,stroke:#18a0fb,color:#0d2a3f,stroke-width:2px
  classDef warning fill:#fff4cc,stroke:#b7791f,color:#3d2b00,stroke-width:3px`;
