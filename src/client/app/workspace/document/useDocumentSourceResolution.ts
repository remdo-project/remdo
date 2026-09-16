import { api } from '#platform/http/api-client';
import { useEffect, useState } from 'react';
import { useDocumentSourcesLoading } from '#client/app/user-data/user-data';
import { useOnlineState } from '#client/browser/useOnlineState';
import type { DocumentSourceNote } from '#note-sdk';

// True while the local-access probe for `docId` is still deciding. Nothing reads
// the settled outcome — a failed or denied probe un-gates the same as an
// authorized one, letting the collaboration layer surface the connection state —
// so this reports only "still probing" vs "settled".
function useLocalDocumentAccessProbing(docId: string, enabled: boolean): boolean {
  // Key the settled marker to the probed docId so a docId change reads back as
  // probing without a synchronous reset inside the effect.
  const [settledDocId, setSettledDocId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const abortController = new AbortController();
    const settle = () => {
      if (!abortController.signal.aborted) {
        setSettledDocId(docId);
      }
    };
    void api.POST('/api/documents/{document_id}/sync-tokens', {
      params: { path: { document_id: docId } },
      signal: abortController.signal,
    }).then(settle, settle);

    return () => {
      abortController.abort();
    };
  }, [docId, enabled]);

  return settledDocId !== docId;
}

export function useDocumentSourceResolution(
  docId: string,
  documentSources: readonly DocumentSourceNote[],
) {
  const documentSourcesLoading = useDocumentSourcesLoading();
  const online = useOnlineState();
  const currentSource = documentSources.find((source) => source.getDocuments().getById(docId)) ?? null;
  const localSource = documentSources.find((source) => source.getLocal()) ?? null;
  const localDocumentExists = Boolean(localSource?.getDocuments().getById(docId));
  const ambiguous = online && documentSourcesLoading && !localDocumentExists && !currentSource;
  const probing = useLocalDocumentAccessProbing(docId, ambiguous);
  const currentDocument = currentSource?.getDocuments().getById(docId) ?? null;

  return {
    documentLabel: currentDocument?.getText() ?? docId,
    // Block only while the probe is still deciding; once it settles we mount the
    // editor and let the collaboration layer surface the connection state.
    pending: ambiguous && probing,
    sourceId: currentSource?.getLocal() === false ? currentSource.getId() : null,
    sourceOrigin: currentSource?.getBaseUrl() ?? null,
  };
}
