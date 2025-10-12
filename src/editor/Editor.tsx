import { EditorComposer } from './EditorComposer';
import './Editor.css';

export default function Editor({ children }: { children?: React.ReactNode }) {
  return (
    <div className="editor-container">
      <EditorComposer>{children}</EditorComposer>
    </div>
  );
}
