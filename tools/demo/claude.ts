import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

export interface ClaudeListener {
  textStart: () => Promise<void>;
  text: (delta: string) => Promise<void>;
  toolStart: (name: string) => Promise<void>;
  toolEnd: (failed: boolean) => Promise<void>;
}

const SYSTEM_PROMPT = [
  'You are Claude, a helpful assistant chatting with a user who connected RemDo, a keyboard-first outliner, through MCP.',
  'Use the RemDo tools when the user asks about their notes, and reply briefly in plain prose.',
].join(' ');

const MCP_SERVER = 'remdo';
const MCP_TOOL_PREFIX = `mcp__${MCP_SERVER}__`;

interface StreamEvent {
  type: string;
  event?: { type: string; content_block?: { type: string; name?: string }; delta?: { type: string; text?: string } };
  message?: { content: string | { type: string; is_error?: boolean }[] };
  is_error?: boolean;
  result?: string;
}

/**
 * Runs one headless Claude Code turn whose only tools are the RemDo MCP
 * server's, reporting its reply and tool calls as they stream.
 */
export async function askClaude(prompt: string, mcpUrl: string, token: string, listener: ClaudeListener): Promise<void> {
  // An empty working directory keeps any CLAUDE.md out of the conversation.
  const workdir = await mkdtemp(path.join(os.tmpdir(), 'remdo-demo-claude-'));
  try {
    const mcpConfig = path.join(workdir, 'mcp.json');
    await writeFile(mcpConfig, JSON.stringify({
      mcpServers: { [MCP_SERVER]: { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${token}` } } },
    }), { mode: 0o600 });
    const child = spawn('claude', [
      '-p', prompt,
      '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--mcp-config', mcpConfig, '--strict-mcp-config', '--allowedTools', `mcp__${MCP_SERVER}`,
      '--tools', '', '--setting-sources', '', '--no-session-persistence',
      '--system-prompt', SYSTEM_PROMPT,
    ], { cwd: workdir, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    const exited = new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });

    let outcome: StreamEvent | undefined;
    for await (const line of createInterface({ input: child.stdout })) {
      const event = JSON.parse(line) as StreamEvent;
      if (event.type === 'stream_event' && event.event) {
        const { type, content_block: block, delta } = event.event;
        if (type === 'content_block_start' && block?.type === 'text') await listener.textStart();
        if (type === 'content_block_start' && block?.type === 'tool_use') {
          await listener.toolStart(block.name!.replace(MCP_TOOL_PREFIX, ''));
        }
        if (type === 'content_block_delta' && delta?.type === 'text_delta') await listener.text(delta.text!);
      } else if (event.type === 'user' && Array.isArray(event.message?.content)) {
        for (const block of event.message.content) {
          if (block.type === 'tool_result') await listener.toolEnd(block.is_error === true);
        }
      } else if (event.type === 'result') {
        outcome = event;
      }
    }
    const code = await exited;
    if (code !== 0 || !outcome || outcome.is_error) {
      throw new Error(`Claude Code failed (exit ${code}): ${outcome?.result ?? stderr.trim()}`);
    }
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
