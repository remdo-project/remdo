import { EditorComposer } from './EditorComposer';
import './Editor.css';

export default function Editor({ extraPlugins }: { extraPlugins?: React.ReactNode }) {
  return (
    <div className="editor-container">
      <EditorComposer extraPlugins={extraPlugins} />
    </div>
  );
}
