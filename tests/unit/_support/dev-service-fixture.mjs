#!/usr/bin/env node
/* eslint-disable node/no-process-env -- reads the lifecycle test configuration. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(import.meta.url);
const serving = process.argv[2] === '--serve';
const name = serving ? process.argv[3] : process.argv.at(-1).replace('dev:', '');
const directory = process.env.REMDO_DEV_FIXTURE_DIR;
const events = path.join(directory, 'events.txt');
const record = event => fs.appendFileSync(events, `${event}\n`);
const publish = (filename, value) => {
  const destination = path.join(directory, filename);
  fs.writeFileSync(`${destination}.tmp`, JSON.stringify(value));
  fs.renameSync(`${destination}.tmp`, destination);
};

if (!serving) {
  publish(`${name}.launcher.json`, { group: process.pid });
  if (process.env.REMDO_DEV_FIXTURE_FAIL === name) {
    // Fail once the other services listen, so cleanup has listeners to release.
    const siblings = ['api', 'collab', 'mcp', 'web'].filter(role => role !== name);
    setInterval(() => {
      if (siblings.every(role => fs.existsSync(path.join(directory, `${role}.json`)))) process.exit(7);
    }, 20);
  } else {
    // Match pnpm's launcher/server topology: the launcher can exit before its server.
    const child = spawn(process.execPath, [fixture, '--serve', name], {
      stdio: 'inherit', env: { ...process.env, REMDO_DEV_FIXTURE_GROUP: String(process.pid) },
    });
    child.on('exit', (code, signal) => process.exit(signal ? 1 : code));
  }
} else {
  const portKey = { api: 'API_SERVER_PORT', collab: 'COLLAB_SERVER_PORT', mcp: 'MCP_SERVER_PORT', web: 'PORT' }[name];
  const server = http.createServer((request, response) => {
    if (request.url === '/crash') process.exit(7);
    if (request.url === '/exit') process.exit(0);
    if (request.url === '/save' && process.env.REMDO_DEV_FIXTURE_SAVE_DELAY) {
      setTimeout(() => response.end('ok'), Number(process.env.REMDO_DEV_FIXTURE_SAVE_DELAY));
    } else response.end('ok');
  });
  server.listen(Number(process.env[portKey]), '127.0.0.1', () => {
    publish(`${name}.json`, {
      pid: process.pid, port: server.address().port,
      group: Number(process.env.REMDO_DEV_FIXTURE_GROUP ?? process.pid),
    });
  });
  let stopping = false;
  process.on('SIGTERM', async () => {
    record(`${name}.signal`);
    if (process.env.REMDO_DEV_FIXTURE_STUBBORN === name || stopping) return;
    stopping = true;
    if (name === 'collab') {
      const api = JSON.parse(fs.readFileSync(path.join(directory, 'api.json'), 'utf8'));
      try {
        const response = await fetch(`http://127.0.0.1:${api.port}/save`);
        if (!response.ok) throw new Error('save failed');
        record('collab.saved');
      } catch {
        record('collab.save-failed');
      }
    }
    server.close(() => {
      record(`${name}.stopped`);
      process.exit(0);
    });
  });
}
