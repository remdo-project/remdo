import { useSyncExternalStore } from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { StatusDescriptor } from './StatusIndicators';

export interface InvariantPayload {
  message: string;
  context?: Record<string, unknown>;
}

interface InvariantStatusSnapshot {
  hasWarning: boolean;
}

const invariantListeners = new Set<() => void>();
let invariantStatus: InvariantStatusSnapshot = { hasWarning: false };

function notifyInvariantListeners() {
  for (const listener of invariantListeners) {
    listener();
  }
}

function subscribeInvariantStatus(listener: () => void) {
  invariantListeners.add(listener);
  return () => invariantListeners.delete(listener);
}

function getInvariantStatusSnapshot(): InvariantStatusSnapshot {
  return invariantStatus;
}

function useInvariantStatus(): InvariantStatusSnapshot {
  return useSyncExternalStore(
    subscribeInvariantStatus,
    getInvariantStatusSnapshot,
    getInvariantStatusSnapshot
  );
}

export function reportInvariant(payload: InvariantPayload): void {
  const label = `runtime.invariant ${payload.message}`.trim();
  console.error(label);

  if (!invariantStatus.hasWarning) {
    invariantStatus = { hasWarning: true };
    notifyInvariantListeners();
  }
}

const WARNING_COLOR = 'var(--mantine-color-yellow-6)';

export function useInvariantIndicator(): StatusDescriptor {
  const { hasWarning } = useInvariantStatus();

  return {
    key: 'invariant',
    visible: hasWarning,
    icon: IconAlertTriangle,
    color: WARNING_COLOR,
    ariaLabel: 'Invariant warning',
    text: 'Invariant',
  };
}
