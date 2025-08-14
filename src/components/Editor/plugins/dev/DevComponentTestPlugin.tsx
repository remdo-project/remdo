import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect, useContext, createContext } from "react";

export const TestContext = createContext(null);

export function DevComponentTestPlugin() {
  const [editor] = useLexicalComposerContext();
  const testContext = useContext(TestContext);

  useEffect(() => {
    if (!testContext) {
      return;
    }
    testContext.testHandler(editor);
  }, [editor, testContext]);
  return null;
}
