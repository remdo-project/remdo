import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import type { NodeKey } from 'lexical';
import { useMemo } from 'react';

import { formatDateNodeLabel } from './date-node';

interface DateTokenProps {
  isoDate: string;
  nodeKey: NodeKey;
}

export function DateToken({ isoDate, nodeKey }: DateTokenProps) {
  const [isSelected] = useLexicalNodeSelection(nodeKey);
  const label = useMemo(() => formatDateNodeLabel(isoDate), [isoDate]);

  return (
    <span
      className="date-node"
      contentEditable={false}
      data-date-node="true"
      data-date-node-key={nodeKey}
      data-date-token-selected={isSelected ? 'true' : undefined}
      data-iso-date={isoDate}
      spellCheck={false}
    >
      {label}
    </span>
  );
}
