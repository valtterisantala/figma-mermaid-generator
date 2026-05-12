export const realtimeTouchEventComparison = `flowchart TB
    subgraph current[Current Framework Realtime Flow]
        direction LR
        subgraph currentCol1[ ]
            direction TB
            currClient[Client iPad]
            currInput[Live input event]
        end
        subgraph currentCol2[ ]
            direction TB
            currAbly[Ably Realtime]
            currInternet[Public Internet]
        end
        subgraph currentCol3[ ]
            direction TB
            currDisplay[LED Display]
            currControl[Control UI]
        end
        currNote[Current downside: every live interaction depends on a remote realtime path over the public internet]

        currInput -->|Emits live input| currClient
        currClient -->|Publishes live state| currAbly
        currAbly -->|Routes through remote service| currInternet
        currInternet -->|Broadcasts runtime update| currDisplay
        currInternet -->|Mirrors runtime update| currControl
        currNote -.-> currAbly
        currNote -.-> currInternet
    end

    subgraph local[Local Realtime Advantage]
        direction LR
        subgraph localCol1[ ]
            direction TB
            localClient[Client iPad]
            localInput[Live input event]
        end
        subgraph localCol2[ ]
            direction TB
            localBus[Local Realtime Layer]
            localLan[Venue LAN]
        end
        subgraph localCol3[ ]
            direction TB
            localDisplay[LED Display]
            localControl[Control UI]
        end
        localNote[Local advantage: live interaction events stay inside the venue network, improving responsiveness and reducing dependence on internet quality]

        localInput -->|Emits live input| localClient
        localClient -->|Publishes live state| localBus
        localBus -->|Routes inside venue network| localLan
        localLan -->|Broadcasts runtime update| localDisplay
        localLan -->|Mirrors runtime update| localControl
        localNote -.-> localBus
        localNote -.-> localLan
    end

    classDef device fill:#F3F4F6,stroke:#475569,stroke-width:1.2px,color:#0F172A;
    classDef event fill:#EDE9FE,stroke:#6D28D9,stroke-width:1.5px,color:#4C1D95;
    classDef remote fill:#FFF1F2,stroke:#BE123C,stroke-width:1.5px,color:#881337;
    classDef local fill:#ECFDF5,stroke:#047857,stroke-width:1.5px,color:#064E3B;
    classDef risk fill:#FFF7ED,stroke:#C2410C,stroke-width:2px,color:#7C2D12;
    classDef gain fill:#F0FDF4,stroke:#16A34A,stroke-width:2px,color:#14532D;
    classDef frame fill:transparent,stroke:transparent;

    class currClient,currDisplay,currControl,localClient,localDisplay,localControl device;
    class currInput,localInput event;
    class currAbly,currInternet remote;
    class localBus,localLan local;
    class currNote risk;
    class localNote gain;
    class currentCol1,currentCol2,currentCol3,localCol1,localCol2,localCol3 frame;`;
