/* eslint-disable node/prefer-global/process */
/* eslint-disable node/no-process-env */
/* eslint-disable no-restricted-syntax */
import { resolveConfig } from './env/resolve';

// eslint-disable-next-line ts/no-unnecessary-condition -- in browser process is a stub with no versions
const isNodeRuntime = Boolean(globalThis.process?.versions?.node);

const loaded = (() => {
  if (isNodeRuntime) {
    // The machine hostname feeds dev auth trusted-origin aliases. Accessed via
    // process.getBuiltinModule (Node-only) rather than a static import or
    // require: a static node:os import would pull into the browser bundle, and a
    // require() mixed with this module graph's top-level await breaks ESM/CJS
    // format detection under tsx.
    const machineHostname = process.getBuiltinModule('node:os').hostname();
    return resolveConfig((key) => process.env[key], { machineHostname });
  }

  return resolveConfig((key) => {
    if (key === 'NODE_ENV') {
      return import.meta.env.MODE;
    }

    const viteKey = `VITE_${key}`;
    return viteKey in import.meta.env ? import.meta.env[viteKey] : import.meta.env[key];
  }, { server: false });
})();

const runtime = loaded.runtime;
const serverEnv = loaded.server;
const browserEnv = loaded.client;
const env = (isNodeRuntime ? serverEnv : browserEnv) as typeof serverEnv;

export const config = {
  env,
  browser: browserEnv,
  server: serverEnv,
  runtime,
  mode: runtime.mode,
  dev: runtime.isDev,
  prod: runtime.isProd,
  isDev: runtime.isDev,
  isProd: runtime.isProd,
  isTest: runtime.mode === 'test',
  isDevOrTest: runtime.isDev || runtime.mode === 'test',
} as const;
