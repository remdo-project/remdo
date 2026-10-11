import { expect, it } from 'vitest';
import { completedTool, requireDocumentRead, requireSuccessfulTools, resultText, transcriptEntry } from './codex';

const call = {
  id: 'read-1', type: 'mcp_tool_call' as const, server: 'remdo', tool: 'read_document',
  arguments: { target: 'document_Plan', depth: 2 },
  result: { content: [{ type: 'text', text: 'Plan\n  Scope (1 child hidden)' }] },
  error: null, status: 'completed',
};

it('waits for the completed call and preserves its actual arguments and result', () => {
  expect(completedTool({ type: 'item.started', item: { ...call, status: 'in_progress', result: null } })).toBeUndefined();
  const completed = completedTool({ type: 'item.completed', item: call })!;
  expect(completed.arguments).toEqual({ target: 'document_Plan', depth: 2 });
  expect(resultText(completed)).toBe('Plan\n  Scope (1 child hidden)');
});

it.each([
  { ...call, status: 'failed', result: null, error: { message: 'Access denied' } },
  { ...call, result: { ...call.result, is_error: true } },
])('rejects failed tool results even when the CLI process exits successfully', (item) => {
  const failed = completedTool({ type: 'item.completed', item })!;
  expect(() => requireSuccessfulTools([failed])).toThrow('read_document failed');
});

it('rejects tools from another server instead of accepting an unrelated activation as a negative case', () => {
  expect(() => completedTool({ type: 'item.completed', item: { ...call, server: 'other' } })).toThrow('Unexpected MCP server');
});

it('shows the actual assistant message without replacing its wording or exposing its event envelope', () => {
  const text = 'Saved your plan:\n- Scope\n- Schedule\n[Open it](https://remdo.com/n/example)';
  expect(transcriptEntry({ type: 'item.completed', item: { id: 'reply-1', type: 'agent_message', text } }))
    .toEqual({ id: 'reply-1', kind: 'assistant', text });
});

it('keeps protocol metadata and reasoning out of the visible transcript', () => {
  const events = [
    { type: 'thread.started', thread_id: 'private-thread-id' },
    { type: 'turn.completed', usage: { input_tokens: 40000, output_tokens: 100 } },
    { type: 'item.completed', item: { id: 'reasoning-1', type: 'reasoning' as const, text: 'Internal reasoning' } },
  ];
  for (const event of events) expect(transcriptEntry(event)).toBeUndefined();
});

it('updates one compact tool entry from running to completed without displaying arguments or results', () => {
  expect(transcriptEntry({ type: 'item.started', item: { ...call, status: 'in_progress', result: null } }))
    .toEqual({ id: 'read-1', kind: 'tool', text: 'read_document', state: 'running' });
  expect(transcriptEntry({ type: 'item.completed', item: call }))
    .toEqual({ id: 'read-1', kind: 'tool', text: 'read_document', state: 'completed' });
});

it('shows failed tool responses as failed even when the CLI labels the completed event successful', () => {
  expect(transcriptEntry({ type: 'item.completed', item: { ...call, result: { ...call.result, is_error: true } } }))
    .toEqual({ id: 'read-1', kind: 'tool', text: 'read_document', state: 'failed' });
});

it('identifies a provider refusal as a CLI notice rather than an assistant explanation or RemDo denial', () => {
  const message = 'This content was flagged for possible cybersecurity risk.';
  for (const event of [{ type: 'error', message }, { type: 'turn.failed', error: { message } }]) {
    expect(transcriptEntry(event)).toEqual({ id: 'client-error', kind: 'client-error', text: message });
  }
});

it('requires a successful read of the requested owned document ID', () => {
  const read = { ...call, arguments: { target: 'ownedDoc' } };
  expect(requireDocumentRead([read], 'ownedDoc')).toBe(read);
  expect(() => requireDocumentRead([{ ...read, result: { ...read.result, is_error: true } }], 'ownedDoc')).toThrow('read_document failed');
});

it.each([
  { status: 'failed', result: { content: [{ type: 'text', text: 'Failed to connect to collaboration server: Document access denied.' }] } },
  { status: 'completed', result: { is_error: true, content: [{ type: 'text', text: 'Failed to connect to collaboration server: Document access denied.' }] } },
])('accepts an actual RemDo access error for the requested private document ID', ({ status, result }) => {
  const read = {
    ...call, arguments: { target: 'privateDoc' }, status, result,
  };
  expect(requireDocumentRead([read], 'privateDoc', 'access-denied')).toBe(read);
});

it.each([{ calls: [] }, { calls: [{ ...call, arguments: { target: 'otherDoc' } }] }])(
  'rejects an access case that never reads the specified document',
  ({ calls }) => {
    expect(() => requireDocumentRead(calls, 'privateDoc', 'access-denied')).toThrow('No read_document call addressed privateDoc');
  },
);

it.each([
  { calls: [{ ...call, arguments: { target: 'privateDoc' } }] },
  { calls: [{ ...call, arguments: { target: 'privateDoc' }, result: { content: [{ type: 'text', text: 'Document access denied.' }] } }] },
  { calls: [{ ...call, arguments: { target: 'privateDoc' }, status: 'failed', result: null, error: { message: 'Connection timed out.' } }] },
  { calls: [{ ...call, arguments: { target: 'privateDoc' }, result: { is_error: true, content: [{ type: 'text', text: 'Connection timed out.' }] } }] },
  { calls: [
    { ...call, arguments: { target: 'privateDoc' } },
    { ...call, arguments: { target: 'privateDoc' }, result: { is_error: true, content: [{ type: 'text', text: 'Document access denied.' }] } },
  ] },
])('rejects a successful private read or an unrelated failure, including before a denied retry', ({ calls }) => {
  expect(() => requireDocumentRead(calls, 'privateDoc', 'access-denied')).toThrow('did not return a RemDo document access denial');
});
