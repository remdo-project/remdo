import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect, useContext, createContext } from "react";
import { useDocumentSelector } from "../../DocumentSelector/DocumentSelector";

export const TestContext = createContext(null);

export function DevComponentTestPlugin() {
  const [editor] = useLexicalComposerContext();
  const documentSelector = useDocumentSelector();
  const testContext = useContext(TestContext);

  useEffect(() => {
    if (!testContext) {
      return;
    }
    testContext.testHandler(editor, documentSelector);
  }, [editor, testContext]);
  return null;
}
