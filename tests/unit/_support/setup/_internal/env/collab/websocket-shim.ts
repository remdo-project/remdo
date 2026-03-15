import process from 'node:process';
import WebSocket from 'ws';

const SHIM_FLAG = '__remdoCollabWebSocketShimInstalled__';

type GlobalWithWebSocketShim = typeof globalThis & {
  [SHIM_FLAG]?: boolean;
  WebSocket: typeof globalThis.WebSocket;
};

const patchedGlobal = globalThis as GlobalWithWebSocketShim;
// eslint-disable-next-line node/no-process-env
const collabEnabled = process.env.COLLAB_ENABLED !== 'false';
// eslint-disable-next-line node/no-process-env
const shimDisabled = process.env.REMDO_DISABLE_COLLAB_WEBSOCKET_SHIM === '1';

if (
  collabEnabled
  && !shimDisabled
  && !patchedGlobal[SHIM_FLAG]
) {
  // Use ws in collab tests to avoid undici/jsdom Event realm mismatches during sockets.
  patchedGlobal.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  patchedGlobal[SHIM_FLAG] = true;
}
