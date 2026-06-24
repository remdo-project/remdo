import process from 'node:process';
import { config } from '#config';
import WebSocket from 'ws';

const SHIM_FLAG = '__remdoCollabWebSocketShimInstalled__';

type GlobalWithWebSocketShim = typeof globalThis & {
  [SHIM_FLAG]?: boolean;
  WebSocket: typeof globalThis.WebSocket;
};

const patchedGlobal = globalThis as GlobalWithWebSocketShim;
// eslint-disable-next-line node/no-process-env
const shimDisabled = process.env.REMDO_DISABLE_COLLAB_WEBSOCKET_SHIM === '1';

if (
  config.env.COLLAB_ENABLED
  && !shimDisabled
  && !patchedGlobal[SHIM_FLAG]
) {
  // TODO: jsdom/Node `WebSocket` (undici) breaks collab tests with an `Event`
  // realm mismatch, so swap in `ws` for collab sockets. Obsolete when
  // `pnpm run test:collab:full` stays green with
  // REMDO_DISABLE_COLLAB_WEBSOCKET_SHIM=1 — then delete this shim.
  patchedGlobal.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  patchedGlobal[SHIM_FLAG] = true;
}
