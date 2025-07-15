import { collabEnabled, debugEnabled, getDataPath } from '../../common';
import fs from 'fs';
import { createSearchParams, MemoryRouter, URLSearchParamsInit } from 'react-router-dom';
import { expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { Logger } from './logger';
import { RemdoLexicalEditor } from '@/components/Editor/plugins/remdo/ComposerContext';
import path from 'path';
import { render, within, queries } from '@testing-library/react';
import { TestContext as ComponentTestContext } from '@/components/Editor/plugins/dev/DevComponentTestPlugin';
import { Routes } from '@/Routes';
import { $getRoot, CLEAR_HISTORY_COMMAND } from 'lexical';
import { getNotes } from './utils';

beforeAll(() => {
  globalThis.logger = new Logger();
});

beforeEach(async (context) => {
  function testHandler(editor: RemdoLexicalEditor) {
    context.editor = editor;
  }

  await logger.debug('beforeEach hook started');

  //lexical/node_modules causes YJS to be loaded twice and leads to issues
  expect(fs.existsSync('lexical/node_modules')).toBeFalsy();

  const urlParams: URLSearchParamsInit = [];
  const serializationFile = process.env.VITEST_SERIALIZATION_FILE;
  if (serializationFile) {
    const fileName = path.basename(serializationFile);
    logger.info(fileName);
    urlParams.push(['documentID', fileName]);
  }


  if (!collabEnabled) {
    urlParams.push(['collab', 'false']);
  } else {
    logger.info("Collab enabled");
  }

  if (debugEnabled) {
    logger.info("Debug enabled");
    urlParams.push(['debug', 'true']);
  }
  const initialEntry = '/?' + createSearchParams(urlParams).toString();
  //logger.info('URL: ', initialEntry);

  const component = render(
    <ComponentTestContext.Provider value={{ testHandler }}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes />
      </MemoryRouter>
    </ComponentTestContext.Provider>,
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
    const editorState = context.editor.parseEditorState(serializedEditorState);
    context.editor.setEditorState(editorState);
    context.editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
    return getNotes(context.editor);
  };

  context.lexicalUpdate = (updateFunction) => {
    let err = null;
    context.editor.fullUpdate(
      function () {
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

  if (collabEnabled) {
    //wait for yjs to connect via websocket and init the editor content
    let i = 0;
    const waitingTime = 10;
    while (editorElement.children.length == 0) {
      if ((i += waitingTime) % 1000 === 0) {
        await logger.warn(`waiting for yjs to load some data - ${i}ms`);
      }
      await new Promise((r) => setTimeout(r, waitingTime));
    }
  }
  if (!serializationFile && !process.env.VITE_PERFORMANCE_TESTS) {
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
  if (collabEnabled) {
    //an ugly workaround - to give a chance for yjs to sync
    await new Promise((r) => setTimeout(r, 10));
  }
  context.component.unmount();
  logger.setFlushFunction(null);
});
