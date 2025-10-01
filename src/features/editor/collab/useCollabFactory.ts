/* eslint-disable react/no-use-context */
import { createContext, useContext } from "react";

import type { ProviderFactory } from "./types";

export const CollabFactoryContext = createContext<ProviderFactory | null>(null);

export function useCollabFactory(): ProviderFactory {
  const factory = useContext(CollabFactoryContext);
  if (!factory) {
    throw new Error("useCollabFactory must be used within a CollabFactoryContext provider");
  }
  return factory;
}
