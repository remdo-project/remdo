import type { Page as PlaywrightPage } from "@playwright/test";

export declare global {
  function remdoGenerateNoteID(): string;
  function printStack(message: string | undefined); //TODO limit to dev
}

declare module "@playwright/test" {
  interface Page {
    takeScreenshot(name?: string): Promise<void>;
  }
}
