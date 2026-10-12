import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import type { Buffer } from 'node:buffer';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import type { Pane } from './pane';

export interface ToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  result: { content: { type: string; text?: string }[]; is_error?: boolean } | null;
  error: unknown;
  status: string;
}

interface Event {
  type: string;
  message?: string;
  error?: { message: string };
  item?: (ToolCall & { id: string; type: 'mcp_tool_call'; server: string })
    | { id: string; type: 'agent_message'; text: string }
    | { id: string; type: 'reasoning' | 'command_execution' | 'file_change' | 'web_search' | 'plan_update' };
}

export type TranscriptEntry =
  | { id: string; kind: 'tool'; text: string; state: 'running' | 'completed' | 'failed' }
  | { id: string; kind: 'assistant' | 'client-error'; text: string };

function failedTool(call: ToolCall): boolean {
  return call.status !== 'completed' || Boolean(call.error) || Boolean(call.result?.is_error);
}

/** Preserve client wording and tool activity while leaving protocol metadata out of the recording. */
export function transcriptEntry(event: Event): TranscriptEntry | undefined {
  if (event.type === 'error' || event.type === 'turn.failed') {
    return { id: 'client-error', kind: 'client-error', text: (event.error?.message ?? event.message)! };
  }
  const item = event.item;
  if ((event.type === 'item.started' || event.type === 'item.completed') && item?.type === 'mcp_tool_call') {
    return {
      id: item.id, kind: 'tool', text: item.tool,
      state: event.type === 'item.started' ? 'running' : failedTool(item) ? 'failed' : 'completed',
    };
  }
  if (event.type === 'item.completed' && item?.type === 'agent_message' && item.text.trim()) {
    return { id: item.id, kind: 'assistant', text: item.text };
  }
}

export function completedTool(event: Event): ToolCall | undefined {
  const item = event.item;
  if (event.type !== 'item.completed' || item?.type !== 'mcp_tool_call') return;
  if (item.server !== 'remdo') throw new Error(`Unexpected MCP server: ${item.server}`);
  return item;
}

export function requireSuccessfulTools(calls: ToolCall[]): void {
  for (const call of calls) {
    if (failedTool(call)) {
      throw new Error(`Codex's ${call.tool} failed: ${JSON.stringify(call.error ?? call.result)}`);
    }
  }
}

export function resultText(call: ToolCall): string {
  return call.result!.content.filter(({ type }) => type === 'text').map(({ text }) => text).join('\n');
}

export function requireDocumentRead(calls: ToolCall[], documentId: string, outcome: 'success' | 'access-denied' = 'success'): ToolCall {
  const reads = calls.filter(({ tool, arguments: args }) => tool === 'read_document' && args.target === documentId);
  if (reads.length === 0) throw new Error(`No read_document call addressed ${documentId}.`);
  if (outcome === 'success') {
    requireSuccessfulTools(reads);
  } else if (reads.some((call) => !failedTool(call) || call.result === null || !resultText(call).includes('Document access denied.'))) {
    throw new Error(`Reading ${documentId} did not return a RemDo document access denial.`);
  }
  return reads.at(-1)!;
}

interface Connection { url: string; token: string; account: string }

/** A readable recording transcript of Codex CLI's real messages and tool activity. */
export class CodexTerminal {
  private child?: ChildProcessWithoutNullStreams;

  private constructor(readonly pane: Pane, private readonly workdir: string, private readonly mcp: Connection) {}

  static async open(pane: Pane, mcp: Connection): Promise<CodexTerminal> {
    const workdir = await mkdtemp(path.join(os.tmpdir(), 'remdo-openai-video-'));
    await pane.page.setContent(await readFile(new URL('./codex.html', import.meta.url), 'utf8'));
    await pane.page.evaluate(({ url, account }) => {
      document.getElementById('account')!.textContent = `RemDo review account · ${account}`;
      document.getElementById('endpoint')!.textContent = `MCP endpoint · ${url}`;
    }, { url: mcp.url, account: mcp.account });
    return new CodexTerminal(pane, workdir, mcp);
  }

  async annotate(text: string): Promise<void> {
    await this.pane.page.locator('#check').evaluate((check, note) => { check.textContent = note; }, text);
  }

  async ask(prompt: string): Promise<{ calls: ToolCall[] }> {
    await this.pane.page.evaluate(() => {
      document.getElementById('prompt')!.textContent = '';
      document.getElementById('output')!.textContent = '';
      document.getElementById('check')!.textContent = '';
    });
    await this.pane.page.getByRole('textbox', { name: 'Codex prompt' }).focus();
    await this.pane.type(prompt);
    await this.pane.press('Enter');
    await this.pane.page.evaluate((text) => {
      document.getElementById('prompt')!.textContent = text;
      document.querySelector('textarea')!.value = '';
    }, prompt);

    // eslint-disable-next-line node/no-process-env -- Native CLI authentication, proxy and certificate settings are inherited.
    const cliEnv: NodeJS.ProcessEnv = { ...process.env, REMDO_RECORDING_MCP_TOKEN: this.mcp.token };
    delete cliEnv.REMDO_USER_PASSWORD;
    delete cliEnv.REMDO_ADMIN_PASSWORD;
    const child = spawn('codex', [
      '-a', 'never', 'exec', '--ignore-user-config', '--ignore-rules',
      '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '-C', this.workdir, '--json',
      '-c', `mcp_servers.remdo.url=${JSON.stringify(this.mcp.url)}`,
      '-c', 'mcp_servers.remdo.bearer_token_env_var="REMDO_RECORDING_MCP_TOKEN"',
      '-c', 'mcp_servers.remdo.default_tools_approval_mode="approve"',
      '-c', 'features.apps=false', '-c', 'features.shell_tool=false',
      '-c', 'features.plugins=false', '-c', 'features.hooks=false', '-c', 'features.memories=false',
      '-c', 'developer_instructions="Use only RemDo MCP tools for RemDo requests. Follow the requested hierarchy exactly. Reply briefly. Do not use other tools."',
      prompt,
    ], {
      cwd: this.workdir,
      env: cliEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stdin.end();
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString().replaceAll(this.mcp.token, '[credential]'); });
    const exited = new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`Codex CLI exited ${code}: ${stderr.trim()}`)));
    });
    // The rejection is awaited after its output has drained.
    void exited.catch(() => {});
    const lines = createInterface({ input: child.stdout });
    const calls: ToolCall[] = [];
    let completed = false;
    let replied = false;
    try {
      for await (const line of lines) {
        const event = JSON.parse(line) as Event;
        const entry = transcriptEntry(event);
        if (entry) {
          replied ||= entry.kind === 'assistant';
          entry.text = entry.text.replaceAll(this.mcp.token, '[credential]');
          await this.pane.page.evaluate((visible) => {
            const output = document.getElementById('output')!;
            let row = Array.from(output.children).find((child) => child.getAttribute('data-id') === visible.id);
            if (!row) {
              row = document.createElement('div');
              row.setAttribute('data-id', visible.id);
              output.append(row);
            }
            row.className = `entry ${visible.kind}`;
            row.textContent = visible.text;
            if (visible.kind === 'tool') row.setAttribute('data-state', visible.state);
            output.scrollTop = output.scrollHeight;
          }, entry);
        }
        // Error notices can precede successful reconnects; turn.failed is terminal.
        if (event.type === 'turn.failed') {
          throw new Error(`Codex CLI failed: ${event.error?.message ?? event.message}`);
        }
        const call = completedTool(event);
        if (call) {
          calls.push(call);
        }
        if (event.type === 'turn.completed') completed = true;
      }
      await exited;
      if (!completed) throw new Error('Codex CLI ended without completing the turn.');
      if (!replied) throw new Error('Codex CLI completed without an assistant reply.');
      return { calls };
    } finally {
      lines.close();
      child.kill();
      this.child = undefined;
    }
  }

  async close(): Promise<void> {
    this.child?.kill();
    await rm(this.workdir, { recursive: true, force: true });
  }
}
