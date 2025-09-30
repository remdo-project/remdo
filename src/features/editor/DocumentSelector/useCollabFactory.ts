import { use } from "react";
import { CollabFactoryContext, type ProviderFactory } from "./DocumentSessionProvider";

export function useCollabFactory(): ProviderFactory {
  const factory = use(CollabFactoryContext);
  if (!factory) {
    throw new Error("useCollabFactory must be used within a DocumentSelectorProvider");
  }
  return factory;
}
