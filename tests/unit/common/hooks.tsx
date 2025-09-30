// @ts-nocheck
// TODO(remdo): Migrate test hooks to a typed helper once the editor harness exposes TypeScript-safe APIs.
import { getDataPath } from '../../common';
import fs from 'fs';
import { createSearchParams, MemoryRouter, URLSearchParamsInit } from 'react-router-dom';
import { expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { Logger } from './logger';
import { RemdoLexicalEditor } from '@/features/editor/plugins/remdo/ComposerContext';
import path from 'path';
import { render, within, queries } from '@testing-library/react';
import { TestContext as ComponentTestContext } from '@/features/editor/plugins/dev/DevComponentTestPlugin';
import { Routes } from '@/Routes';
import { $getRoot, CLEAR_HISTORY_COMMAND } from 'lexical';
import { getNotes } from './utils';
import {
  ensureListItemSharedState,
  restoreRemdoStateFromJSON,
} from '@/features/editor/plugins/remdo/utils/noteState';
import { env } from '#env';
import { DocumentSelectorType } from '@/features/editor/DocumentSelector/DocumentSessionProvider';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

function waitForProviderSync(provider: WebsocketProvider) {
  if (provider.synced) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const onSync = (s: boolean) => {
      if (!s) return;
      provider.off?.('sync', onSync);
      resolve();
    };
    provider.on('sync', onSync);
  });
}

beforeAll(() => {
  globalThis.logger = new Logger();
});

beforeEach(async (context) => {
  function testHandler(editor: RemdoLexicalEditor, documentSelector: DocumentSelectorType) {
    context.editor = editor;
    context.documentSelector = documentSelector;
  }

  await logger.debug('beforeEach hook started');

  //lexical/node_modules causes YJS to be loaded twice and leads to issues
  expect(fs.existsSync('lexical/node_modules')).toBeFalsy();

  const urlParams: URLSearchParamsInit = [];
  const serializationFile = env.VITEST_SERIALIZATION_FILE;
  if (serializationFile) {
    const fileName = path.basename(serializationFile);
    logger.info(fileName);
    urlParams.push(['documentID', fileName]);
  }


  if (!env.FORCE_WEBSOCKET) {
    urlParams.push(['ws', 'false']);
  } else {
    logger.info("Collab enabled");
  }

  if (env.DEBUG) {
    logger.info("Debug enabled");
    urlParams.push(['debug', 'true']);
  }
  const initialEntry = '/?' + createSearchParams(urlParams).toString();
  //logger.info('URL: ', initialEntry);

  const component = render(
    <ComponentTestContext value={{ testHandler }}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes />
      </MemoryRouter>
    </ComponentTestContext>,
  );

  const editorElement = component.getByRole('textbox');

  context.component = component;
  context.queries = within(editorElement, {
    ...queries,
    //FIXME
    getAllNotNestedIListItems: () =>
      context.queries
        .getAllByRole('listitem')
        .filter((li) => !li.classList.contains('li-nested')),
  });

  /**
   * loads editor state from a file with the given @name
   * @returns a record of all notes in the editor, with their text in
   * camelCase as keys
   */
  context.load = function (name: string) {
    const dataPath = getDataPath(name);
    const serializedEditorState = fs.readFileSync(dataPath).toString();
    const parsedState = JSON.parse(serializedEditorState);
    ensureListItemSharedState(context.editor as unknown as { _nodes?: Map<string, any> });
    const editorState = context.editor.parseEditorState(serializedEditorState);
    context.editor.setEditorState(editorState);
    restoreRemdoStateFromJSON(context.editor, parsedState.root);
    context.editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    return getNotes(context.editor);
  };

  context.lexicalUpdate = (updateFunction) => {
    let err = null;
    const runUpdate = env.FORCE_WEBSOCKET
      ? context.editor.update.bind(context.editor)
      : context.editor.fullUpdate.bind(context.editor);

    runUpdate(
      () => {
        try {
          return updateFunction();
        } catch (e) {
          err = e;
        }
      },
      { discrete: true },
    );
    if (err) {
      //rethrow after finishing update
      throw err;
    }
  };
  logger.setFlushFunction(() => context.lexicalUpdate(() => { }));

  if (env.FORCE_WEBSOCKET) {
    const provider = context.documentSelector.getYjsProvider();
    //wait for yjs to connect via websocket and init the editor content
    await waitForProviderSync(provider);

    const yDoc = context.documentSelector.getYjsDoc();
    if (yDoc) {
      yDoc.transact(() => {
        const rootXmlText = yDoc.get('root', Y.XmlText);
        rootXmlText.delete(0, rootXmlText.length);
      });
    }
  }
  if (!serializationFile && !env.VITE_PERFORMANCE_TESTS) {
    //clear the editor's content before each test
    //except for the serialization, where potentially we may want to save the
    //current content or performance where some of the tests should be stateful
    //it's important to do it here once collab is already initialized
    context.lexicalUpdate(() => {
      const root = $getRoot();
      root.clear();
    });
  }
  await logger.debug('beforeEach hook finished');
});

afterEach(async (context) => {
  if (env.FORCE_WEBSOCKET) {
    const provider = context.documentSelector?.getYjsProvider();
    if (provider instanceof WebsocketProvider) {
      await waitForProviderSync(provider);
    }
  }
  context.component.unmount();
  logger.setFlushFunction(null);
});
