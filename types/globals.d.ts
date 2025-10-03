import type { RemdoLexicalEditor } from "@/features/editor/plugins/remdo/ComposerContext";
import type { WebsocketProvider } from "y-websocket";
import type { Logger } from "../tests/unit/common/logger";

export declare global {
  let remdoGenerateNoteID: () => string;
  let printStack: (message: string | undefined) => void; //TODO limit to dev
  let __collabProviders: WebsocketProvider[] | undefined;
  let logger: Logger;
  let debugEditor: RemdoLexicalEditor | undefined;
}

declare module "@playwright/test" {
  interface Page {
    takeScreenshot: (name?: string) => Promise<void>;
  }
}
