import type { Browser } from 'playwright';
import type { DemoAccount } from '../lib/demo-account';
import { resetDemoAccount } from '../lib/demo-account';
import { provisionDjangoUser } from '../lib/django-user';
import { Chat } from './chat';
import type { Timing } from './pane';
import { Pane, readOutline } from './pane';
import type { Scene } from './scenario';
import { script } from './script';
import { confirmStoredOutline, mcpToken, signIn } from './session';

const ACCOUNT: DemoAccount = { email: 'demo@example.test', password: 'demo-password-1234' };
const TEAMMATE: DemoAccount = { email: 'ben@example.test', password: 'ben-password-1234' };

export async function prepare(browser: Browser, timing: Timing, origin: string): Promise<Scene> {
  await provisionDjangoUser({ ...ACCOUNT, name: 'Demo' });
  await provisionDjangoUser({ ...TEAMMATE, name: 'Ben' });
  const mcp = { url: new URL('/mcp', origin).href, token: await mcpToken(ACCOUNT.email) };
  await resetDemoAccount(origin, ACCOUNT, { emptyDocument: 'Demo video' });
  await resetDemoAccount(origin, TEAMMATE, { emptyDocument: false });

  const context = await signIn(browser, origin, ACCOUNT);
  const main = new Pane(await context.newPage(), timing, origin);
  const chatPane = new Pane(await context.newPage(), timing, origin);
  const ben = new Pane(await (await signIn(browser, origin, TEAMMATE)).newPage(), timing, origin);
  await main.openHome();
  await main.open('Demo video');
  await ben.openHome();
  const chat = new Chat(chatPane, mcp);

  return {
    main,
    panes: { main, ben, chat: chatPane },
    play: async (presentation) => {
      await main.captionActions();
      await ben.captionActions();
      await script({
        main,
        ben,
        chat,
        ...presentation,
        split: async (pane) => presentation.split(pane instanceof Chat ? pane.pane : pane),
      });
    },
    verify: async () => confirmStoredOutline(browser, context, main.page.url(), await readOutline(main.page)),
    close: async () => chat.close(),
  };
}
