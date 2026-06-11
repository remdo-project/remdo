import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection';
import dayjs from 'dayjs';
import type { NodeKey } from 'lexical';

interface DateTokenProps {
  isoDate: string;
  nodeKey: NodeKey;
}

export function DateToken({ isoDate, nodeKey }: DateTokenProps) {
  const [isSelected] = useLexicalNodeSelection(nodeKey);

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
      {dayjs(isoDate).format('MMM D, YYYY')}
    </span>
  );
}
