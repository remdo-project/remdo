import { useEffect, useRef } from 'react';

import { useCollaborationStatus } from '#client/editor/runtime/collaboration';
import { trackAnalyticsEvent } from '#platform/analytics';

export function DocumentEditAnalyticsPlugin(): null {
  const { docId, hasLocalChanges } = useCollaborationStatus();
  const reportedDocIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (hasLocalChanges && reportedDocIdRef.current !== docId && trackAnalyticsEvent('document-edited')) {
      reportedDocIdRef.current = docId;
    }
  }, [docId, hasLocalChanges]);

  return null;
}
