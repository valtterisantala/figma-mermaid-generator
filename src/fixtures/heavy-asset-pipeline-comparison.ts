export const heavyAssetPipelineComparison = `flowchart TB
    subgraph current[Current Framework Asset Pipeline]
        direction LR
        subgraph currentCol1[ ]
            direction TB
            currAssetSource[Large Runtime Assets]
            currVercel[Vercel Hosted App]
        end
        subgraph currentCol2[ ]
            direction TB
            currInternet[Public Internet]
            currLatency[Startup delay risk]
        end
        subgraph currentCol3[ ]
            direction TB
            currDisplay[LED Display]
            currQuality[Bandwidth-sensitive loading]
        end
        currNote[Current downside: large runtime assets must cross the public internet before they reach the display runtime]

        currAssetSource -->|Served as remote runtime assets| currVercel
        currVercel -->|Transfers large assets and app bundles| currInternet
        currInternet -->|Delivers assets to runtime| currDisplay
        currInternet --> currLatency
        currDisplay --> currQuality
        currNote -.-> currVercel
        currNote -.-> currInternet
    end

    subgraph local[Local Hosting Advantage]
        direction LR
        subgraph localCol1[ ]
            direction TB
            localAssetSource[Large Runtime Assets]
            localServer[Venue Local Server]
        end
        subgraph localCol2[ ]
            direction TB
            localLan[Venue LAN]
            localSpeed[Faster local delivery]
        end
        subgraph localCol3[ ]
            direction TB
            localDisplay[LED Display]
            localStability[Lower startup and bandwidth risk]
        end
        localNote[Local advantage: large runtime assets and app bundles are served inside the venue network instead of depending on internet throughput]

        localAssetSource -->|Stored on local server| localServer
        localServer -->|Transfers large assets and app bundles| localLan
        localLan -->|Delivers assets locally| localDisplay
        localLan --> localSpeed
        localDisplay --> localStability
        localNote -.-> localServer
        localNote -.-> localLan
    end

    classDef asset fill:#E0F2FE,stroke:#0369A1,stroke-width:1.5px,color:#082F49;
    classDef remote fill:#FFF1F2,stroke:#BE123C,stroke-width:1.5px,color:#881337;
    classDef local fill:#ECFDF5,stroke:#047857,stroke-width:1.5px,color:#064E3B;
    classDef risk fill:#FFF7ED,stroke:#C2410C,stroke-width:2px,color:#7C2D12;
    classDef gain fill:#F0FDF4,stroke:#16A34A,stroke-width:2px,color:#14532D;
    classDef frame fill:transparent,stroke:transparent;

    class currAssetSource,localAssetSource asset;
    class currVercel,currInternet,currDisplay remote;
    class localServer,localLan,localDisplay local;
    class currLatency,currQuality,currNote risk;
    class localSpeed,localStability,localNote gain;
    class currentCol1,currentCol2,currentCol3,localCol1,localCol2,localCol3 frame;`;
