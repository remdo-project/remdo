import { TabIndentationExtension } from '@lexical/extension';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { TreeView } from '@lexical/react/LexicalTreeView';
import { $createListItemNode, $createListNode, ListExtension } from '@lexical/list';
import { RichTextExtension } from '@lexical/rich-text';
import { Container } from '@mantine/core';
import { $createTextNode, $getRoot, defineExtension } from 'lexical';
import { DevVisibilityGate } from '#client/dev/DevVisibility';
import './VanillaLexicalEditor.css';

const vanillaExtension = defineExtension({
  name: 'remdo-vanilla-lexical',
  namespace: 'remdo-vanilla-lexical',
  theme: {},
  dependencies: [RichTextExtension, ListExtension, TabIndentationExtension],
  $initialEditorState: () => {
    const list = $createListNode('bullet');
    const item = $createListItemNode();
    item.append($createTextNode(''));
    list.append(item);
    $getRoot().append(list);
  },
  onError(error) {
    throw error;
  },
});

export default function VanillaLexicalEditor() {
  return (
    <DevVisibilityGate>
      <Container component="main" size="xl" py="xl">
        <section className="vanilla-lexical">
          <div className="vanilla-lexical-shell">
            <LexicalExtensionComposer
              extension={vanillaExtension}
              contentEditable={(
                <ContentEditable
                  className="vanilla-lexical-input"
                  aria-placeholder="Type some rich text..."
                  placeholder={<div className="vanilla-lexical-placeholder">Type some rich text...</div>}
                />
              )}
            >
              <VanillaTreeView />
            </LexicalExtensionComposer>
          </div>
        </section>
      </Container>
    </DevVisibilityGate>
  );
}

function VanillaTreeView() {
  const [editor] = useLexicalComposerContext();

  return (
    <section className="vanilla-lexical-tree" aria-label="Lexical tree view debugger">
      <TreeView
        editor={editor}
        viewClassName="vanilla-lexical-tree-body"
        treeTypeButtonClassName="vanilla-lexical-tree-hidden"
        timeTravelButtonClassName="vanilla-lexical-tree-hidden"
        timeTravelPanelButtonClassName="vanilla-lexical-tree-hidden"
        timeTravelPanelClassName="vanilla-lexical-tree-hidden"
        timeTravelPanelSliderClassName="vanilla-lexical-tree-hidden"
      />
    </section>
  );
}
