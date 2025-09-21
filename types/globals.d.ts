export declare global {
  const remdoGenerateNoteID: () => string;
  const printStack: (message: string | undefined) => void; //TODO limit to dev
}

declare module "@playwright/test" {
  interface Page {
    takeScreenshot: (name?: string) => Promise<void>;
  }
}

interface ImportMetaEnv {
  readonly VITEST_SERIALIZATION_FILE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
