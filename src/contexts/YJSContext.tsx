import { Binding } from "@/yjs/binding";
import React, { createContext, useContext, useEffect, useRef } from "react";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

export type YJSContextType = {
  doc: Y.Doc;
  provider: WebsocketProvider; //TODO breaks the idea of multiple providers, should be rather exposed through a higer level object
  synced: boolean;
};

const YJSContext = createContext<YJSContextType>({
  doc: null,
  provider: null,
  synced: false,
});

export const useYJSContext = () => useContext<YJSContextType>(YJSContext);

export const YJSProvider = ({ docID, children }) => {
  const [synced, setSynced] = React.useState(false);
  const bindingRef = useRef<Binding>(null);

  useEffect(() => {
    const onSync = () => setSynced(true);
    const binding = new Binding(docID);
    bindingRef.current = binding;
    setSynced(binding.wsProvider.synced);
    binding.wsProvider.on("sync", onSync);

    return () => {
      binding.wsProvider.off("sync", onSync);
      binding.close();
    };
  }, [docID]);

  const binding = bindingRef.current;
  const yjsContext: YJSContextType = {
    doc: binding ? binding.doc : null,
    provider: binding ? binding.wsProvider : null,
    synced: synced,
  };

  return (
    <YJSContext.Provider value={yjsContext}>{children}</YJSContext.Provider>
  );
};
