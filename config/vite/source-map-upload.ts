import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { ConfigEnv, PluginOption } from 'vite';
import { config } from '../index.ts';

const LOOKUP_TIMEOUT_MS = 15_000;

interface ApplicationReply {
  data: { attributes: { team_id: number; data_region: string } };
}

// Better Stack resolves browser frames only from uploaded maps. The DSN names
// the application; the token's own account supplies the team and data region.
// Any failure fails the build: a release without maps stays unresolvable.
export async function sourceMapUpload(command: ConfigEnv['command']): Promise<PluginOption[]> {
  const { SENTRY_AUTH_TOKEN: authToken, SENTRY_DSN: dsn, BUILD_REVISION: release } = config.env;
  if (command !== 'build' || !config.isProd || !authToken || !dsn) return [];
  const project = new URL(dsn).pathname.split('/').pop();
  const reply = await fetch(`https://errors.betterstack.com/api/v2/applications/${project}`, {
    headers: { Authorization: `Bearer ${authToken}` },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!reply.ok) {
    throw new Error(`Better Stack application ${project} lookup failed with status ${reply.status}`);
  }
  const { team_id: org, data_region: region } = ((await reply.json()) as ApplicationReply).data.attributes;
  return [sentryVitePlugin({
    authToken,
    org: String(org),
    project,
    url: `https://${region}-sourcemaps.betterstackdata.com`,
    release: { name: release || undefined, setCommits: false },
    errorHandler: (error) => { throw error; },
    telemetry: false,
  })];
}
