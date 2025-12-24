import { ListItemNode } from '@lexical/list';
import { $getState, $setState, createState, type StateConfigValue, type StateValueOrUpdater } from 'lexical';

export const noteIdState = createState('noteId', {
  parse: (value) => (typeof value === 'string' ? value : undefined),
});

export class NoteListItemNode extends ListItemNode {
  override $config() {
    const baseConfig = super.$config();
    const stateConfigs = [...(baseConfig.stateConfigs ?? []), { flat: true, stateConfig: noteIdState }];

    return {
      ...baseConfig,
      stateConfigs,
    };
  }

  getNoteId(): StateConfigValue<typeof noteIdState> {
    return $getState(this, noteIdState);
  }

  setNoteId(valueOrUpdater: StateValueOrUpdater<typeof noteIdState>): this {
    $setState(this, noteIdState, valueOrUpdater);
    return this;
  }
}
