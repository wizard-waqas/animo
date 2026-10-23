// Studio discovers scene files with webpack's require.context (src/Root.tsx).
declare namespace NodeJS {
  interface Require {
    context(directory: string, useSubdirectories: boolean, filter: RegExp): { keys(): string[]; (key: string): { default: unknown } };
  }
}
