import { Binding } from "@/yjs/binding";
import * as Y from "yjs";
import React, {
  createContext,
  useContext,
  useEffect,
} from "react";

type YJSContextType = {
  doc: Y.Doc;
}

const YJSContext = createContext<YJSContextType>({doc: null});

export const useYJSContext = () => useContext<YJSContextType>(YJSContext);

export const YJSProvider = ({ docID, children }) => {
  const  yjsContext = useYJSContext();

  useEffect(() => {
    const binding = new Binding(docID);
    yjsContext.doc = binding.doc;
    
    return () => {
      binding.close();
    };
  }, [docID, yjsContext]);

  return <YJSContext.Provider value={yjsContext}>{children}</YJSContext.Provider>;
};

