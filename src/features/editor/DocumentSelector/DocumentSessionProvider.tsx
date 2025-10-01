/* eslint-disable react-refresh/only-export-components, react/no-use-context */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCollaborationDisabled } from "../config";
import {
  createCollaborationProviderFactory,
  getCollaborationEndpoint,
} from "../collab/createCollaborationProviderFactory";
import { CollabFactoryContext } from "../collab/useCollabFactory";
import { clearCollabSessions, resetCollabSession, useCollabSession } from "../collab/useCollabSession";
import type { DocumentProvider, ProviderFactory } from "../collab/types";
import type * as Y from "yjs";

export type DocumentSession = {
  id: string;
  setId: (id: string, mode?: "push" | "replace" | "silent") => void;
  yjsProvider: DocumentProvider | null;
  yDoc: Y.Doc | null;
  reset: () => void;
  synced: boolean;
  collabDisabled: boolean;
};

const DocumentSessionContext = createContext<DocumentSession | null>(null);

function makeSearchWithDoc(id: string, current: URLSearchParams) {
  const next = new URLSearchParams(current);
  next.set("documentID", id);
  return `?${next.toString()}`;
}

export const useDocumentSelector = () => {
  const context = useContext(DocumentSessionContext);
  if (!context) {
    throw new Error("useDocumentSelector must be used within a DocumentSelectorProvider");
  }
  return context;
};

export const DocumentSelectorProvider = ({ children }: { children: ReactNode }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [documentID, setDocumentIdState] = useState(
    () => searchParams.get("documentID") ?? "main",
  );
  const collabDisabled = useCollaborationDisabled();
  const { yDoc, yjsProvider, synced } = useCollabSession(documentID);
  const lastSearchParamIdRef = useRef<string | null>(searchParams.get("documentID"));

  const setDocumentIdSilently = useCallback((id: string) => {
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setDocumentIdState((prev) => (prev === id ? prev : id));
  }, []);

  const selectDocument = useCallback(
    (id: string, opts?: { replace?: boolean; path?: string }) => {
      if (documentID === id) {
        return;
      }

      navigate(
        { pathname: opts?.path ?? "/", search: makeSearchWithDoc(id, searchParams) },
        { replace: !!opts?.replace },
      );
      setDocumentIdSilently(id);
    },
    [documentID, navigate, searchParams, setDocumentIdSilently],
  );

  const baseProviderFactory = useMemo(
    () =>
      createCollaborationProviderFactory({
        endpoint: getCollaborationEndpoint(),
        roomPrefix: "notes/0/",
      }),
    [],
  );

  const providerFactory = useMemo<ProviderFactory>(() => {
    if (collabDisabled) {
      return (_doc: Y.Doc, _room: string) => {
        throw new Error("Collaboration is disabled; no provider is available.");
      };
    }
    return baseProviderFactory;
  }, [baseProviderFactory, collabDisabled]);

  const reset = useCallback(() => {
    resetCollabSession(documentID);
  }, [documentID]);

  const setId = useCallback(
    (id: string, mode: "push" | "replace" | "silent" = "push") => {
      if (mode === "silent") {
        setDocumentIdSilently(id);
        return;
      }
      if (mode === "replace") {
        selectDocument(id, { replace: true });
        return;
      }
      selectDocument(id);
    },
    [selectDocument, setDocumentIdSilently],
  );

  const contextValue = useMemo(
    () =>
      ({
        id: documentID,
        setId,
        yjsProvider,
        yDoc,
        reset,
        synced,
        collabDisabled,
      }) satisfies DocumentSession,
    [collabDisabled, documentID, reset, setId, synced, yDoc, yjsProvider],
  );

  useEffect(() => {
    const nextSearchParamId = searchParams.get("documentID");
    if (lastSearchParamIdRef.current === nextSearchParamId) {
      return;
    }

    lastSearchParamIdRef.current = nextSearchParamId;
    const normalizedId = nextSearchParamId ?? "main";
    setDocumentIdSilently(normalizedId);
  }, [searchParams, setDocumentIdSilently]);

  useEffect(() => {
    if (!collabDisabled) {
      return;
    }

    clearCollabSessions();
  }, [collabDisabled]);

  return (
    <CollabFactoryContext value={providerFactory}>
      <DocumentSessionContext value={contextValue}>{children}</DocumentSessionContext>
    </CollabFactoryContext>
  );
};
