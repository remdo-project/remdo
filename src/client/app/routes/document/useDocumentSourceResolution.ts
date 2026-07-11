import { useEffect, useState } from 'react';
import { useDocumentSourcesLoading } from '#client/app/documents/user-data';
import { useOnlineState } from '#client/runtime/useOnlineState';
import { createDocumentSyncTokenApiPath } from '#document-routes';
import type { DocumentSourceNote } from '#note-sdk';

function useLocalDocumentAccess(docId: string, enabled: boolean): boolean {
  const [authorizedDocId, setAuthorizedDocId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const abortController = new AbortController();
    void fetch(createDocumentSyncTokenApiPath(docId), {
      body: JSON.stringify({ docId }),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: abortController.signal,
    })
      .then((response) => {
        setAuthorizedDocId(response.ok ? docId : null);
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setAuthorizedDocId(null);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [docId, enabled]);

  return enabled && authorizedDocId === docId;
}

export function useDocumentSourceResolution(
  docId: string,
  documentSources: readonly DocumentSourceNote[],
) {
  const documentSourcesLoading = useDocumentSourcesLoading();
  const online = useOnlineState();
  const currentSource = documentSources.find((source) => source.documents().byId(docId)) ?? null;
  const localSource = documentSources.find((source) => source.local()) ?? null;
  const localDocumentExists = Boolean(localSource?.documents().byId(docId));
  const ambiguous = online && documentSourcesLoading && !localDocumentExists && !currentSource;
  const localAccessAuthorized = useLocalDocumentAccess(docId, ambiguous);
  const currentDocument = currentSource?.documents().byId(docId) ?? null;

  return {
    currentSourceId: currentSource?.id() ?? null,
    documentLabel: currentDocument?.text() ?? docId,
    pending: ambiguous && !localAccessAuthorized,
    sourceId: currentSource?.local() === false ? currentSource.id() : null,
    sourceOrigin: currentSource?.baseUrl() ?? null,
  };
}
