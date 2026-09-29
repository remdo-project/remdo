import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { Interface } from 'node:readline';

export interface ClaudeListener {
  textStart: () => Promise<void>;
  text: (delta: string) => Promise<void>;
  toolStart: (name: string) => Promise<void>;
  toolEnd: (failed: boolean) => Promise<void>;
}

const SYSTEM_PROMPT = [
  'You are Claude, a helpful assistant chatting with a user who connected RemDo, a keyboard-first outliner, through MCP.',
  'Use the RemDo tools when the user asks about their notes. Act on requests directly, making reasonable assumptions',
  'instead of asking follow-up questions, and reply briefly in plain prose without links.',
  'Keep outlines you write to about five notes unless the user asks for more.',
].join(' ');

const MCP_SERVER = 'remdo';
const MCP_TOOL_PREFIX = `mcp__${MCP_SERVER}__`;

interface StreamEvent {
  type: string;
  subtype?: string;
  mcp_servers?: { name: string; status: string }[];
  event?: { type: string; content_block?: { type: string; name?: string }; delta?: { type: string; text?: string } };
  message?: { content: string | { type: string; is_error?: boolean; content?: string | { text?: string }[] }[] };
  is_error?: boolean;
  result?: string;
}

/**
 * One headless Claude Code conversation whose only tools are the RemDo MCP
 * server's; each message streams its reply and tool calls as they happen.
 */
export class ClaudeConversation {
  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly lines: Interface,
    private readonly events: AsyncIterator<string>,
    private readonly workdir: string,
    private readonly mcpUrl: string,
    private readonly stderr: () => string,
  ) {}

  static async start(mcpUrl: string, token: string): Promise<ClaudeConversation> {
    // An empty working directory keeps any CLAUDE.md out of the conversation.
    const workdir = await mkdtemp(path.join(os.tmpdir(), 'remdo-demo-claude-'));
    const mcpConfig = path.join(workdir, 'mcp.json');
    await writeFile(mcpConfig, JSON.stringify({
      mcpServers: { [MCP_SERVER]: { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${token}` } } },
    }), { mode: 0o600 });
    const child = spawn('claude', [
      '-p', '--input-format', 'stream-json',
      '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--mcp-config', mcpConfig, '--strict-mcp-config', '--allowedTools', `mcp__${MCP_SERVER}`,
      '--tools', '', '--setting-sources', '', '--no-session-persistence',
      '--system-prompt', SYSTEM_PROMPT,
    ], { cwd: workdir });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    const lines = createInterface({ input: child.stdout });
    return new ClaudeConversation(child, lines, lines[Symbol.asyncIterator](), workdir, mcpUrl, () => stderr);
  }

  /** Sends `prompt` and resolves with the RemDo tools Claude used to answer it. */
  async send(prompt: string, listener: ClaudeListener): Promise<string[]> {
    this.child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } })}\n`);
    const tools: string[] = [];
    const toolFailures: string[] = [];
    for (;;) {
      const { value: line, done } = await this.events.next();
      if (done) throw new Error(`Claude Code exited mid-reply: ${this.stderr().trim()}`);
      const event = JSON.parse(line) as StreamEvent;
      if (event.type === 'system' && event.subtype === 'init') {
        const status = event.mcp_servers?.find(({ name }) => name === MCP_SERVER)?.status;
        if (status !== 'connected') {
          throw new Error(`Claude Code could not connect to RemDo's MCP server at ${this.mcpUrl} (${status ?? 'missing'}); check that pnpm run dev is running.`);
        }
      } else if (event.type === 'stream_event' && event.event) {
        const { type, content_block: block, delta } = event.event;
        if (type === 'content_block_start' && block?.type === 'text') await listener.textStart();
        if (type === 'content_block_start' && block?.type === 'tool_use') {
          const name = block.name!.replace(MCP_TOOL_PREFIX, '');
          tools.push(name);
          await listener.toolStart(name);
        }
        if (type === 'content_block_delta' && delta?.type === 'text_delta') await listener.text(delta.text!);
      } else if (event.type === 'user' && Array.isArray(event.message?.content)) {
        for (const block of event.message.content) {
          if (block.type !== 'tool_result') continue;
          await listener.toolEnd(block.is_error === true);
          if (block.is_error === true) toolFailures.push(toolResultText(block.content));
        }
      } else if (event.type === 'result') {
        if (event.is_error) throw new Error(`Claude Code failed: ${event.result ?? this.stderr().trim()}`);
        break;
      }
    }
    // Claude explains a failed tool call in prose, so the run would otherwise
    // fail later on a missing note without saying why.
    if (toolFailures.length > 0) {
      throw new Error(`RemDo's MCP server failed a tool call: ${toolFailures.join('; ')}\nIf pnpm run dev started before your latest pull, restart it: its MCP server does not reload.`);
    }
    return tools;
  }

  async close(): Promise<void> {
    this.lines.close();
    this.child.stdin.end();
    this.child.kill();
    await rm(this.workdir, { recursive: true, force: true });
  }
}

function toolResultText(content: string | { text?: string }[] | undefined): string {
  if (typeof content === 'string') return content;
  return (content ?? []).map((part) => part.text ?? '').join(' ');
}
