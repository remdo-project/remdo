import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { createContext, use, useEffect } from "react";
import type { LexicalEditor } from "lexical";
import { useDocumentSelector } from "../../DocumentSelector/DocumentSessionProvider";

// TODO: To satisfy `react-refresh/only-export-components`, split this context into
// a standalone module once the dev tooling is ready to consume the new import.
// eslint-disable-next-line react-refresh/only-export-components
export const TestContext = createContext<{
  testHandler: (
    editor: LexicalEditor,
    documentSelector: ReturnType<typeof useDocumentSelector>
  ) => void;
} | null>(null);

export function DevComponentTestPlugin() {
  const [editor] = useLexicalComposerContext();
  const documentSelector = useDocumentSelector();
  const testContext = use(TestContext);

  useEffect(() => {
    if (!testContext) {
      return;
    }
    testContext.testHandler(editor, documentSelector);
  }, [documentSelector, editor, testContext]);
  return null;
}
