export const simpleLrChainFlowchart = `flowchart LR
  A[Start] --> B[Middle] --> C[Done]`;

export const lrSubgraphChainFlowchart = `flowchart LR
  subgraph Input[Input]
    A[Start]
  end
  subgraph Processing[Processing]
    B[Middle]
  end
  subgraph Output[Output]
    C[Done]
  end
  A --> B --> C`;

export const fanOutFourFlowchart = `flowchart LR
  G[Source]
  H[First output]
  I[Second output]
  J[Third output]
  K[Fourth output]
  G --> H & I & J & K`;

export const crossSubgraphFeedbackFlowchart = `flowchart LR
  subgraph Input[Input]
    A[Start]
  end
  subgraph Output[Output]
    H[Result]
    I[Summary]
  end
  A --> H
  A --> I
  H --> A
  I --> A`;

export const fullConnectorStressFlowchart = `flowchart LR
    subgraph Channel["<b>User channel</b>"]
        A["Copilot Studio<br/>Ask, request, drill down"]
    end
    subgraph Orchestration["<b>Microsoft Power Platform</b>"]
        B["Power Automate<br/>Trigger, schedule, route"]
        C["Custom connector<br/>API wrapper"]
    end
    subgraph Engine["<b>Custom insight and reporting engine</b>"]
        D["Data adapter<br/>Mock data now, real data later"]
        E["Insight logic<br/>Materiality, EBIT drivers,<br/>weak-signal detection"]
        F["Visual renderer<br/>Rail-specific executive charts"]
        G["PowerPoint exporter<br/>Boardroom-ready output"]
    end
    subgraph Outputs["<b>Executive outputs</b>"]
        H["PowerPoint deck"]
        I["Teams summary"]
        J["Email memo"]
        K["Interactive preview"]
    end
    A --> B --> C --> D --> E --> F --> G
    G --> H & I & J & K
    H --> A
    I --> A
    J --> A
    K --> A`;

export const tdVerticalArchitectureFlowchart = `flowchart TD
  subgraph Client[Client]
    A[Plugin UI]
  end
  subgraph Core[Core]
    B[Parser]
    C[Layout]
  end
  subgraph Figma[Figma document]
    D[Native nodes]
    E[Native edges]
  end
  A --> B --> C
  C --> D & E`;
