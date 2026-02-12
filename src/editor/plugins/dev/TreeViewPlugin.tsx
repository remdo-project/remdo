import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { TreeView } from '@lexical/react/LexicalTreeView';
import type { LexicalNode } from 'lexical';

import './TreeViewPlugin.css';

interface NodeConfigWithStateConfigs {
  stateConfigs?: unknown;
}

interface StateConfigWithKey {
  key?: unknown;
}

interface RequiredStateConfigWithKey {
  stateConfig?: StateConfigWithKey;
  key?: unknown;
}

function readStateConfigKey(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const withOptionalStateConfig = value as RequiredStateConfigWithKey;
  const nestedKey = withOptionalStateConfig.stateConfig?.key;
  if (typeof nestedKey === 'string' && nestedKey.length > 0) {
    return nestedKey;
  }

  const key = withOptionalStateConfig.key;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

function $getStateKeysForNode(node: LexicalNode): string[] {
  const configRecord = node.$config() as Record<string, unknown>;
  const nodeConfig = configRecord[node.getType()] as NodeConfigWithStateConfigs | undefined;
  const stateConfigs = Array.isArray(nodeConfig?.stateConfigs) ? nodeConfig.stateConfigs : [];
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const entry of stateConfigs) {
    const key = readStateConfigKey(entry);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    keys.push(key);
  }

  return keys;
}

function printStateValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null) {
    return 'null';
  }
  try {
    const json = JSON.stringify(value);
    return typeof json === 'string' ? json : String(value);
  } catch {
    return String(value);
  }
}

const $printNodeState = (node: LexicalNode): string | undefined => {
  const stateKeys = $getStateKeysForNode(node);
  if (stateKeys.length === 0) {
    return undefined;
  }
  const serialized = node.exportJSON() as Record<string, unknown>;
  const printedStates = stateKeys
    .filter((key) => serialized[key] !== undefined)
    .map((key) => `${key}:${printStateValue(serialized[key])}`);
  return printedStates.length > 0 ? printedStates.join(' ') : undefined;
};

export function TreeViewPlugin() {
  const [editor] = useLexicalComposerContext();
  const hiddenClassName = 'editor-tree-view-hidden';

  return (
    <section className="editor-tree-view" aria-label="Lexical tree view debugger">
      <TreeView
        editor={editor}
        viewClassName="editor-tree-view-body"
        treeTypeButtonClassName={hiddenClassName}
        timeTravelButtonClassName={hiddenClassName}
        timeTravelPanelButtonClassName={hiddenClassName}
        timeTravelPanelClassName={hiddenClassName}
        timeTravelPanelSliderClassName={hiddenClassName}
        customPrintNode={$printNodeState}
      />
    </section>
  );
}
