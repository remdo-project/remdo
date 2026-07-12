import { useEffect, useState } from 'react';
import { useDocumentSourcesLoading } from '#client/app/documents/user-data';
import { useOnlineState } from '#client/runtime/useOnlineState';
import { createDocumentSyncTokenApiPath } from '#document-routes';
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
    void fetch(createDocumentSyncTokenApiPath(docId), {
      body: JSON.stringify({ docId }),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: abortController.signal,
    })
      .then(() => setSettledDocId(docId))
      .catch(() => {
        if (!abortController.signal.aborted) {
          setSettledDocId(docId);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [docId, enabled]);

  return enabled && settledDocId !== docId;
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
  const probing = useLocalDocumentAccessProbing(docId, ambiguous);
  const currentDocument = currentSource?.documents().byId(docId) ?? null;

  return {
    currentSourceId: currentSource?.id() ?? null,
    documentLabel: currentDocument?.text() ?? docId,
    // Block only while the probe is still deciding; once it settles we mount the
    // editor and let the collaboration layer surface the connection state.
    pending: ambiguous && probing,
    sourceId: currentSource?.local() === false ? currentSource.id() : null,
    sourceOrigin: currentSource?.baseUrl() ?? null,
  };
}
