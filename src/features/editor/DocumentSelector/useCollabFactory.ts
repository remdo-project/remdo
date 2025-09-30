/* eslint-disable react/no-use-context */
import { useContext } from "react";
import { CollabFactoryContext, type ProviderFactory } from "./DocumentSessionProvider";

export function useCollabFactory(): ProviderFactory {
  const factory = useContext(CollabFactoryContext);
  if (!factory) {
    throw new Error("useCollabFactory must be used within a DocumentSelectorProvider");
  }
  return factory;
}
