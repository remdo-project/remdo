import { useEffect, useRef } from 'react';

import { useCollaborationStatus } from '#client/editor/runtime/collaboration';
import { trackAnalyticsEvent } from '#platform/analytics';

export function DocumentEditAnalyticsPlugin(): null {
  const { hasLocalChanges } = useCollaborationStatus();
  const reportedRef = useRef(false);

  useEffect(() => {
    if (hasLocalChanges && !reportedRef.current && trackAnalyticsEvent('document-edited')) {
      reportedRef.current = true;
    }
  }, [hasLocalChanges]);

  return null;
}
