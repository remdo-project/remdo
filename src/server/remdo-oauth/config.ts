import { config } from '#config';

export interface LinkableRemdoServer {
  id: string;
  label: string;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

const SERVER_ID_PATTERN = /^[\w-]+$/u;

function readServer(entry: unknown): Record<string, unknown> {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError('LINKABLE_REMDO_SERVERS_JSON entries must be objects.');
  }
  return entry as Record<string, unknown>;
}

function readString(server: Record<string, unknown>, field: keyof LinkableRemdoServer): string {
  const value = server[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`LINKABLE_REMDO_SERVERS_JSON entries require string ${field}.`);
  }
  return value;
}

function readBaseUrl(server: Record<string, unknown>): string {
  const baseUrl = readString(server, 'baseUrl');
  if (baseUrl !== new URL(baseUrl).origin) {
    throw new Error('LINKABLE_REMDO_SERVERS_JSON baseUrl must exactly match a URL origin.');
  }
  return baseUrl;
}

export function parseLinkableRemdoServers(raw: string): LinkableRemdoServer[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed) as unknown[];
  if (!Array.isArray(parsed)) {
    throw new TypeError('LINKABLE_REMDO_SERVERS_JSON must be a JSON array.');
  }

  const usedIds = new Set<string>();
  return parsed.map((entry) => {
    const server = readServer(entry);
    const id = readString(server, 'id');
    if (!SERVER_ID_PATTERN.test(id)) {
      throw new Error('LINKABLE_REMDO_SERVERS_JSON entries require id to contain only letters, numbers, underscores, or hyphens.');
    }
    if (usedIds.has(id)) {
      throw new Error(`LINKABLE_REMDO_SERVERS_JSON contains duplicate server id ${id}.`);
    }
    usedIds.add(id);

    return {
      id,
      label: readString(server, 'label'),
      baseUrl: readBaseUrl(server),
      clientId: readString(server, 'clientId'),
      clientSecret: readString(server, 'clientSecret'),
    };
  });
}

export function getLinkableRemdoServers(): LinkableRemdoServer[] {
  return parseLinkableRemdoServers(config.env.LINKABLE_REMDO_SERVERS_JSON);
}
