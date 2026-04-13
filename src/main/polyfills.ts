type StructuredClone = <T>(value: T) => T;

const runtimeGlobal = globalThis as typeof globalThis & {
  structuredClone?: StructuredClone;
};

if (typeof runtimeGlobal.structuredClone !== "function") {
  runtimeGlobal.structuredClone = <T>(value: T): T => {
    if (value === undefined || value === null || typeof value !== "object") {
      return value;
    }

    return JSON.parse(JSON.stringify(value)) as T;
  };
}
