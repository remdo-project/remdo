import { useEffect, useState } from 'react';
import { useDocumentSourcesLoading } from '#client/app/documents/user-data';
import { useOnlineState } from '#client/runtime/useOnlineState';
import { createDocumentSyncTokenApiPath } from '#document-routes';
import type { DocumentSourceNote } from '#note-sdk';

type LocalAccessProbeState = 'probing' | 'authorized' | 'unavailable';

function useLocalDocumentAccess(docId: string, enabled: boolean): LocalAccessProbeState {
  // Key the settled result to the probed docId so a docId change reads back as
  // 'probing' without a synchronous reset inside the effect.
  const [probe, setProbe] = useState<{ docId: string; state: LocalAccessProbeState }>(
    { docId, state: 'probing' },
  );

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
        setProbe({ docId, state: response.ok ? 'authorized' : 'unavailable' });
      })
      .catch(() => {
        // A failed probe (server unreachable) settles as unavailable rather than
        // staying in flight, so the workspace stops gating on "Loading document"
        // and lets the collaboration layer surface the connection state.
        if (!abortController.signal.aborted) {
          setProbe({ docId, state: 'unavailable' });
        }
      });

    return () => {
      abortController.abort();
    };
  }, [docId, enabled]);

  if (!enabled || probe.docId !== docId) {
    return 'probing';
  }
  return probe.state;
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
  const probeState = useLocalDocumentAccess(docId, ambiguous);
  const currentDocument = currentSource?.documents().byId(docId) ?? null;

  return {
    currentSourceId: currentSource?.id() ?? null,
    documentLabel: currentDocument?.text() ?? docId,
    // Only block while the probe is still deciding. Once it settles either way
    // we mount the editor: authorized reads from its source, unavailable falls
    // through to the collaboration layer's offline empty state.
    pending: ambiguous && probeState === 'probing',
    sourceId: currentSource?.local() === false ? currentSource.id() : null,
    sourceOrigin: currentSource?.baseUrl() ?? null,
  };
}
