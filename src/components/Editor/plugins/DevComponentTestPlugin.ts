import { useYJSContext } from "@/contexts/YJSContext";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect, useContext, createContext } from "react";

export const TestContext = createContext(null);

export function DevComponentTestPlugin() {
  const [editor] = useLexicalComposerContext();
  const testContext = useContext(TestContext);
  const yjsContext = useYJSContext();

  useEffect(() => {
    if (!testContext) {
      return;
    }
    testContext.testHandler(editor, yjsContext);
  }, [editor, testContext, yjsContext]);
  return null;
}
