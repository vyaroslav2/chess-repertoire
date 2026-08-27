declare module 'node-uci' {
  export class Engine {
    constructor(enginePath: string);
    init(): Promise<void>;
    setoption(name: string, value: string): Promise<void>;
    position(fen: string): Promise<void>;
    go(params: Record<string, unknown>): Promise<{ info?: unknown[] }>;
    quit(): Promise<void>;
  }
}
