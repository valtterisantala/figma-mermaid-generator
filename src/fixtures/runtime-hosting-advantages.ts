export const runtimeHostingAdvantages = `flowchart LR
    subgraph current[Current Solution]
        direction TB
        currStack[Vercel Hosting + Ably<br/>Strapi stays remote]
        currRuntime[Runtime effect<br/>Most exposed to visible asset-loading sensitivity during startup and scene changes]
        currLoading[Loading speed<br/>Slowest path for large runtime assets because delivery depends on internet throughput]
        currUx[Interactivity UX<br/>Client and control feedback depend on remote realtime round-trips]
        currCost[Cost effect<br/>Highest ongoing exposure to external hosting, realtime service usage, and bandwidth-based delivery costs]
    end

    subgraph local[Local Hosting]
        direction TB
        localStack[Venue Local Server + Ably<br/>Strapi stays remote]
        localRuntime[Runtime effect<br/>Smoother startup and more stable large-asset playback because assets are served on the venue LAN]
        localLoading[Loading speed<br/>Faster heavy-asset loading and less sensitivity to external bandwidth]
        localUx[Interactivity UX<br/>Live interaction still uses Ably, so UX improves mainly through faster scene and asset readiness]
        localCost[Cost effect<br/>Reduces external bandwidth and hosted delivery load for large runtime assets while keeping the current realtime service model]
    end

    subgraph hybrid[Local Hosting + Local Realtime]
        direction TB
        hybridStack[Venue Local Server + Local Realtime<br/>Strapi stays remote]
        hybridRuntime[Runtime effect<br/>Best overall runtime stability because both heavy assets and live state stay inside the venue network]
        hybridLoading[Loading speed<br/>Same local heavy-asset benefit as Local Hosting]
        hybridUx[Interactivity UX<br/>Best live interaction responsiveness and operator feedback because events stay local]
        hybridCost[Cost effect<br/>Lowest dependence on external realtime traffic and bandwidth-based delivery, with the strongest reduction in third-party runtime load]
    end

    currStack --> currRuntime --> currLoading --> currUx --> currCost
    localStack --> localRuntime --> localLoading --> localUx --> localCost
    hybridStack --> hybridRuntime --> hybridLoading --> hybridUx --> hybridCost

    classDef current fill:#FFF1F2,stroke:#BE123C,stroke-width:1.5px,color:#881337;
    classDef local fill:#ECFDF5,stroke:#047857,stroke-width:1.5px,color:#064E3B;
    classDef hybrid fill:#ECFEFF,stroke:#0F766E,stroke-width:1.5px,color:#134E4A;

    class currStack,currRuntime,currLoading,currUx,currCost current;
    class localStack,localRuntime,localLoading,localUx,localCost local;
    class hybridStack,hybridRuntime,hybridLoading,hybridUx,hybridCost hybrid;`;
