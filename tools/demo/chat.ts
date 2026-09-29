import { askClaude } from './claude';
import type { Pane } from './pane';

// A minimal chat in RemDo's own palette: the video shows a real Claude
// conversation without presenting this page as claude.ai.
const CHAT_HTML = `<!doctype html>
<title>Claude</title>
<style>
  :root {
    --accent: rgb(165 161 232);
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    color: #c1c2c5; background: #17151f;
  }
  html, body { margin: 0; height: 100%; }
  body { display: flex; flex-direction: column; }
  header {
    padding: 18px 28px; border-bottom: 1px solid #2c2e33;
    font-size: 15px; color: #909296;
  }
  header strong { color: #e9ecef; font-weight: 600; }
  #messages {
    flex: 1; overflow-y: auto; padding: 24px 28px;
    display: flex; flex-direction: column; gap: 18px; font-size: 16px; line-height: 1.55;
  }
  .user {
    align-self: flex-end; max-width: 80%; padding: 10px 16px; border-radius: 14px;
    background: #2c2e33; color: #e9ecef; white-space: pre-wrap;
  }
  .assistant { display: flex; flex-direction: column; gap: 10px; max-width: 92%; }
  .assistant p { margin: 0; white-space: pre-wrap; }
  .assistant code { font-family: 'JetBrains Mono', Menlo, monospace; font-size: 0.9em; }
  .tool {
    align-self: flex-start; display: flex; align-items: center; gap: 8px;
    padding: 4px 12px; border-radius: 999px; border: 1px solid #373a40;
    font-size: 13px; color: #909296;
  }
  .tool::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
  .tool[data-state='running']::before { animation: pulse 0.9s ease-in-out infinite alternate; }
  .tool[data-state='failed']::before { background: #fa5252; }
  .pending { color: #5c5f66; letter-spacing: 3px; animation: pulse 0.9s ease-in-out infinite alternate; }
  @keyframes pulse { from { opacity: 0.3; } to { opacity: 1; } }
  form { padding: 16px 28px 24px; }
  textarea {
    box-sizing: border-box; width: 100%; resize: none; padding: 14px 16px;
    border-radius: 14px; border: 1px solid #373a40; background: #1f1d28;
    color: #e9ecef; font: inherit; font-size: 16px; outline: none;
  }
  textarea:focus { border-color: var(--accent); }
</style>
<header><strong>Claude</strong> · connected to RemDo</header>
<div id="messages"></div>
<form><textarea rows="2" placeholder="Ask Claude about your notes"></textarea></form>
<script>
  const messages = document.getElementById('messages');
  const input = document.querySelector('textarea');
  let reply, paragraph, pending, tool;
  const scroll = () => { messages.scrollTop = messages.scrollHeight; };
  const add = (parent, tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    parent.append(element);
    scroll();
    return element;
  };
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    add(messages, 'div', 'user', input.value.trim());
    input.value = '';
    reply = add(messages, 'div', 'assistant');
    pending = add(reply, 'span', 'pending', '•••');
    paragraph = undefined;
  });
  window.chat = {
    textStart() { paragraph = add(reply, 'p', '', ''); },
    text(delta) {
      pending?.remove();
      pending = undefined;
      paragraph.textContent += delta;
      scroll();
    },
    toolStart(name) {
      pending?.remove();
      pending = undefined;
      tool = add(reply, 'div', 'tool', 'RemDo · ' + name);
      tool.dataset.state = 'running';
    },
    toolEnd(failed) { tool.dataset.state = failed ? 'failed' : 'done'; },
  };
</script>`;

type ChatMethod = 'textStart' | 'text' | 'toolStart' | 'toolEnd';

/** The chat page shown in a pane, answered live by Claude through RemDo's MCP server. */
export class Chat {
  constructor(private readonly pane: Pane, private readonly mcp: { url: string; token: string }) {}

  async open(): Promise<void> {
    await this.pane.page.setContent(CHAT_HTML);
    await this.pane.page.locator('textarea').focus();
    await this.pane.captionActions();
  }

  /** Types `prompt` into the chat and streams Claude's live answer into it. */
  async ask(prompt: string): Promise<void> {
    await this.pane.type(prompt);
    await this.pane.press('Enter');
    await askClaude(prompt, this.mcp.url, this.mcp.token, {
      textStart: async () => this.call('textStart'),
      text: async (delta) => this.call('text', delta),
      toolStart: async (name) => this.call('toolStart', name),
      toolEnd: async (failed) => this.call('toolEnd', failed),
    });
  }

  private async call(method: ChatMethod, argument?: string | boolean): Promise<void> {
    await this.pane.page.evaluate(([name, value]) => {
      (window as unknown as { chat: Record<string, (value?: unknown) => void> }).chat[name as string]!(value);
    }, [method, argument] as const);
  }
}
