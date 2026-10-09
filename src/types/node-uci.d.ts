declare module 'node-uci' {
  import type { ChildProcessWithoutNullStreams } from 'child_process';

  export class Engine {
    constructor(enginePath: string);
    filePath: string;
    proc?: ChildProcessWithoutNullStreams;
    init(): Promise<void>;
    write(command: string): void;
    getBufferUntil(condition: (line: string) => boolean): Promise<string[]>;
    setoption(name: string, value: string): Promise<void>;
    position(fen: string): Promise<void>;
    go(params: Record<string, unknown>): Promise<{ info?: unknown[] }>;
    quit(): Promise<void>;
  }
}
