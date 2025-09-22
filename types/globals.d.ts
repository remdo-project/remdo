import type { RemdoLexicalEditor } from "@/components/Editor/plugins/remdo/ComposerContext";
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

interface ImportMetaEnv {
  readonly VITEST_SERIALIZATION_FILE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
