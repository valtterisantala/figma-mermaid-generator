export const runtimeHostingArchitectureComparison = `flowchart TB
    subgraph current[Current Solution]
        direction LR
        subgraph currentCol1[ ]
            direction TB
            currControl[Control UI]
            currVercel[Vercel Hosted App]
        end
        subgraph currentCol2[ ]
            direction TB
            currClient[Client iPad]
            currAbly[Ably Realtime]
        end
        subgraph currentCol3[ ]
            direction TB
            currDisplay[LED Display]
            currStrapi[Remote Strapi CMS]
        end
        currRisk[Current downside: app delivery, large runtime assets, and live runtime all depend on remote services over the public internet]

        currControl -->|Loads control app| currVercel
        currClient -->|Loads client app| currVercel
        currDisplay -->|Loads display app and runtime assets| currVercel
        currControl -->|Sends control state| currAbly
        currClient -->|Sends interaction state| currAbly
        currAbly -->|Broadcasts live runtime state| currDisplay
        currAbly -->|Mirrors state for operators| currControl
        currVercel -->|Fetches content| currStrapi
        currRisk -.-> currVercel
        currRisk -.-> currAbly
    end

    subgraph local[Local Hosting]
        direction LR
        subgraph localCol1[ ]
            direction TB
            localControl[Control UI]
            localServer[Venue Local Server]
        end
        subgraph localCol2[ ]
            direction TB
            localClient[Client iPad]
            localAbly[Ably Realtime]
        end
        subgraph localCol3[ ]
            direction TB
            localDisplay[LED Display]
            localStrapi[Remote Strapi CMS]
        end
        localAdvantage[Advantage vs current: app bundles and large runtime assets load over the venue LAN, reducing startup delay and bandwidth risk while keeping the existing Ably workflow]

        localControl -->|Loads control app locally| localServer
        localClient -->|Loads client app locally| localServer
        localDisplay -->|Loads display app and runtime assets locally| localServer
        localControl -->|Sends control state| localAbly
        localClient -->|Sends interaction state| localAbly
        localAbly -->|Broadcasts live runtime state| localDisplay
        localAbly -->|Mirrors state for operators| localControl
        localServer -->|Fetches content| localStrapi
        localAdvantage -.-> localServer
        localAdvantage -.-> localAbly
    end

    subgraph hybrid[Local Hosting and Local Realtime]
        direction LR
        subgraph hybridCol1[ ]
            direction TB
            hybridControl[Control UI]
            hybridServer[Venue Local Server]
        end
        subgraph hybridCol2[ ]
            direction TB
            hybridClient[Client iPad]
            hybridBus[Local Realtime Layer]
        end
        subgraph hybridCol3[ ]
            direction TB
            hybridDisplay[LED Display]
            hybridStrapi[Remote Strapi CMS]
        end
        hybridAdvantage[Advantage vs current: both large-asset delivery and live runtime stay on the venue network, improving responsiveness and reducing dependence on internet quality during the experience]

        hybridControl -->|Loads control app locally| hybridServer
        hybridClient -->|Loads client app locally| hybridServer
        hybridDisplay -->|Loads display app and runtime assets locally| hybridServer
        hybridControl -->|Sends control state| hybridBus
        hybridClient -->|Sends interaction state| hybridBus
        hybridBus -->|Broadcasts live runtime state| hybridDisplay
        hybridBus -->|Mirrors state for operators| hybridControl
        hybridServer -->|Fetches content| hybridStrapi
        hybridAdvantage -.-> hybridServer
        hybridAdvantage -.-> hybridBus
    end

    classDef surface fill:#F3F4F6,stroke:#475569,stroke-width:1.2px,color:#0F172A;
    classDef remote fill:#FFF1F2,stroke:#BE123C,stroke-width:1.5px,color:#881337;
    classDef local fill:#ECFDF5,stroke:#047857,stroke-width:1.5px,color:#064E3B;
    classDef noteRisk fill:#FFF7ED,stroke:#C2410C,stroke-width:2px,color:#7C2D12;
    classDef noteGain fill:#F0FDF4,stroke:#16A34A,stroke-width:2px,color:#14532D;
    classDef frame fill:transparent,stroke:transparent;

    class currControl,currClient,currDisplay,localControl,localClient,localDisplay,hybridControl,hybridClient,hybridDisplay surface;
    class currVercel,currAbly,currStrapi remote;
    class localAbly,localStrapi remote;
    class localServer,hybridServer,hybridBus local;
    class hybridStrapi remote;
    class currRisk noteRisk;
    class localAdvantage,hybridAdvantage noteGain;
    class currentCol1,currentCol2,currentCol3,localCol1,localCol2,localCol3,hybridCol1,hybridCol2,hybridCol3 frame;`;
