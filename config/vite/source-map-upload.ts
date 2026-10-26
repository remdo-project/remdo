import { sentryVitePlugin } from '@sentry/vite-plugin';
import type { PluginOption } from 'vite';
import { config } from '../index.ts';

interface ApplicationReply {
  data: { attributes: { team_id: number; data_region: string } };
}

// Better Stack resolves browser frames only from uploaded maps. The DSN names
// the application; the token's own account supplies the team and data region.
export async function sourceMapUpload(): Promise<PluginOption[]> {
  const { SENTRY_AUTH_TOKEN: authToken, SENTRY_DSN: dsn, BUILD_REVISION: release } = config.env;
  if (!authToken || !dsn) return [];
  const project = new URL(dsn).pathname.split('/').pop();
  const reply = await fetch(`https://errors.betterstack.com/api/v2/applications/${project}`, {
    headers: { Authorization: `Bearer ${authToken}` },
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
    telemetry: false,
  })];
}
