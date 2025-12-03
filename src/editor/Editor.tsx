import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { config } from '#config';
import { createEditorInitialConfig } from '#lib/editor/config';
import { CollaborationPlugin } from './plugins/collaboration';
import { IndentationPlugin } from './plugins/IndentationPlugin';
import { DevPlugin } from './plugins/DevPlugin';
import { SelectionPlugin, SelectionInputPlugin } from './plugins/SelectionPlugin';
import { RootSchemaPlugin } from './plugins/RootSchemaPlugin';
import { ReorderingPlugin } from './plugins/ReorderingPlugin';
import { KeymapPlugin } from './plugins/KeymapPlugin';
import './Editor.css';

interface EditorProps {
  children?: React.ReactNode;
  collabOrigin?: string;
}

export default function Editor({ children, collabOrigin }: EditorProps) {
  const editorInitialConfig = createEditorInitialConfig({ isDev: config.dev });
  return (
    <div className="editor-container">
      <LexicalComposer initialConfig={editorInitialConfig}>
        <RichTextPlugin
          contentEditable={<ContentEditable className="editor-input" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <KeymapPlugin />
        <IndentationPlugin />
        <ReorderingPlugin />
        <SelectionPlugin />
        <SelectionInputPlugin />
        <ListPlugin hasStrictIndent />
        <CollaborationPlugin collabOrigin={collabOrigin}>
          <RootSchemaPlugin />
          <DevPlugin>{children}</DevPlugin>
        </CollaborationPlugin>
      </LexicalComposer>
    </div>
  );
}
