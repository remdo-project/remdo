import { LexicalCollaboration } from '@lexical/react/LexicalCollaborationContext';
import { CollaborationPlugin as LexicalCollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { useCollaborationStatus } from './CollaborationProvider';

const DEFAULT_ROOM_ID = 'lexical-demo-room2';

export function CollaborationPlugin() {
  const { enabled, providerFactory } = useCollaborationStatus();

  if (!enabled) {
    return <HistoryPlugin />;
  }

  return (
    <LexicalCollaboration>
      <LexicalCollaborationPlugin id={DEFAULT_ROOM_ID} providerFactory={providerFactory} shouldBootstrap />
    </LexicalCollaboration>
  );
}
