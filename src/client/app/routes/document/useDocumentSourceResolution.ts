import { useEffect, useState } from 'react';
import { useDocumentSourcesLoading } from '#client/app/documents/user-data';
import { createDocumentSyncTokenApiPath } from '#document-routes';
import type { DocumentSourceNote } from '#note-sdk';

type LocalDocumentAccessProbe = 'idle' | 'checking' | 'authorized' | 'rejected';

function useOnlineState(): boolean {
  const [online, setOnline] = useState(() => globalThis.navigator.onLine);

  useEffect(() => {
    const handleOnlineStateChange = () => {
      setOnline(globalThis.navigator.onLine);
    };

    globalThis.addEventListener('online', handleOnlineStateChange);
    globalThis.addEventListener('offline', handleOnlineStateChange);
    return () => {
      globalThis.removeEventListener('online', handleOnlineStateChange);
      globalThis.removeEventListener('offline', handleOnlineStateChange);
    };
  }, []);

  return online;
}

function useLocalDocumentAccessProbe(docId: string, enabled: boolean): LocalDocumentAccessProbe {
  const [result, setResult] = useState<{ docId: string; status: LocalDocumentAccessProbe }>({
    docId: '',
    status: 'checking',
  });

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
        setResult({ docId, status: response.ok ? 'authorized' : 'rejected' });
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setResult({ docId, status: 'rejected' });
        }
      });

    return () => {
      abortController.abort();
    };
  }, [docId, enabled]);

  if (!enabled) {
    return 'idle';
  }
  return result.docId === docId ? result.status : 'checking';
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
  const localAccess = useLocalDocumentAccessProbe(docId, ambiguous);
  const currentDocument = currentSource?.documents().byId(docId) ?? null;

  return {
    currentSource,
    documentLabel: currentDocument?.text() ?? docId,
    pending: ambiguous && localAccess !== 'authorized',
    sourceId: currentSource?.local() === false ? currentSource.id() : null,
    sourceOrigin: currentSource?.baseUrl() ?? null,
  };
}
