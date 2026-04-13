export const basicFlowchart = `flowchart TD
  Start[Start] --> Decision{Ready?}
  Decision -->|Yes| Done((Done))
  Decision -->|No| Revise[Revise input]
  Revise --> Decision
  class Start,Done primary
  classDef primary fill:#ffffff,stroke:#18a0fb`;
