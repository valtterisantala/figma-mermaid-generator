export const layeredArchitectureFlowchart = `flowchart LR
 subgraph Users["Users and Devices"]
    direction TB
        Operator["Operator<br>Uses Control UI"]
        Audience["Audience<br>Views public Display"]
        Participant["Participant<br>Uses client iPad"]
  end
 subgraph Surfaces["Experience Surfaces"]
    direction TB
        ControlUI["Control UI<br>Operator workflow<br>Content selection<br>Session control"]
        DisplaySurface["Display<br>Public presentation<br>Synchronized visual output"]
        ClientSurface["Client iPad<br>Participant interaction<br>Touch input and responses"]
  end
 subgraph App["dna-experience-lounge<br>Next.js Application"]
    direction TB
        SurfaceHost["Surface hosting<br>Serves Control, Display<br>and Client experiences"]
        RuntimeHost["Runtime orchestration<br>Session state<br>Active content<br>Surface synchronization"]
        ContentHost["Content integration<br>Catalogue entries<br>Feature adapters<br>Runtime data"]
  end
 subgraph Packages["Workspace Packages"]
    direction TB
        DWS["dna-dws<br>Digital Welcome Screen"]
        NICT["dna-nict<br>NICT Interactive Demo"]
        SOC["dna-soc<br>SOC Interactive Demo"]
        Shared["dna-shared<br>Shared contracts<br>Runtime utilities"]
        Style["dna-style-foundation<br>Shared visual foundation"]
  end
 subgraph Services["External Services"]
    direction TB
        Realtime["Ably<br>Realtime synchronization"]
        CMS["Strapi CMS<br>Content and media data"]
        Media["YouTube / Vimeo<br>Embedded video playback"]
  end
    SurfaceHost --> RuntimeHost & ContentHost
    DWS --> Shared
    NICT --> Shared
    SOC --> Shared
    Shared --> Style
    Operator --> ControlUI
    Audience --> DisplaySurface
    Participant --> ClientSurface
    ControlUI --> SurfaceHost
    DisplaySurface --> SurfaceHost & Media
    ClientSurface --> SurfaceHost
    RuntimeHost --> Realtime
    ContentHost --> CMS & DWS & NICT & SOC

    Operator@{ shape: rounded}
    Audience@{ shape: rounded}
    Participant@{ shape: rounded}
    ControlUI@{ shape: rounded}
    DisplaySurface@{ shape: rounded}
    ClientSurface@{ shape: rounded}
    SurfaceHost@{ shape: rounded}
    RuntimeHost@{ shape: rounded}
    ContentHost@{ shape: rounded}
    DWS@{ shape: rounded}
    NICT@{ shape: rounded}
    SOC@{ shape: rounded}
    Shared@{ shape: rounded}
    Style@{ shape: rounded}
    Realtime@{ shape: rounded}
    CMS@{ shape: rounded}
    Media@{ shape: rounded}
    Services@{ shape: rounded}
    Packages@{ shape: rounded}
    App@{ shape: rounded}
    Surfaces@{ shape: rounded}
    Users@{ shape: rounded}
     Operator:::user
     Audience:::user
     Participant:::user
     ControlUI:::surface
     DisplaySurface:::surface
     ClientSurface:::surface
     SurfaceHost:::app
     RuntimeHost:::app
     ContentHost:::app
     DWS:::package
     NICT:::package
     SOC:::package
     Shared:::package
     Style:::package
     Realtime:::service
     CMS:::service
     Media:::service
    classDef user fill:#EFF6FF,stroke:#2563EB,color:#1E3A8A,stroke-width:1.5px
    classDef surface fill:#F8FAFC,stroke:#475569,color:#334155,stroke-width:1.5px
    classDef app fill:#FFF7ED,stroke:#EA580C,color:#7C2D12,stroke-width:1.5px
    classDef package fill:#ECFDF5,stroke:#059669,color:#064E3B,stroke-width:1.5px
    classDef service fill:#FDF2F8,stroke:#DB2777,color:#831843,stroke-width:1.5px`;
