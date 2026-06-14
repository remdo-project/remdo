import { config } from '#config';
import { normalizeSourceServerId } from '#domain/source-servers';

export interface LinkableRemdoServer {
  id: string;
  label: string;
  baseUrl: string;
  tokenBaseUrl?: string;
  clientId: string;
  clientSecret: string;
}

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

function readOptionalOrigin(server: Record<string, unknown>, field: 'baseUrl' | 'tokenBaseUrl'): string | undefined {
  const rawValue = server[field];
  if (rawValue === undefined) {
    return undefined;
  }
  const value = readString(server, field);
  let origin: string;
  try {
    origin = new URL(value).origin;
  } catch {
    throw new Error(`LINKABLE_REMDO_SERVERS_JSON ${field} must be a valid URL origin.`);
  }
  if (value !== origin) {
    throw new Error(`LINKABLE_REMDO_SERVERS_JSON ${field} must exactly match a URL origin.`);
  }
  return value;
}

function readOrigin(server: Record<string, unknown>, field: 'baseUrl' | 'tokenBaseUrl'): string {
  const value = readOptionalOrigin(server, field);
  if (!value) {
    throw new TypeError(`LINKABLE_REMDO_SERVERS_JSON entries require string ${field}.`);
  }
  return value;
}

export function parseLinkableRemdoServers(raw: string): LinkableRemdoServer[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new TypeError('LINKABLE_REMDO_SERVERS_JSON must be valid JSON.');
  }
  if (!Array.isArray(parsed)) {
    throw new TypeError('LINKABLE_REMDO_SERVERS_JSON must be a JSON array.');
  }

  const usedIds = new Set<string>();
  return parsed.map((entry) => {
    const server = readServer(entry);
    const id = normalizeSourceServerId(readString(server, 'id'));
    if (!id) {
      throw new Error('LINKABLE_REMDO_SERVERS_JSON entries require id to contain only letters, numbers, underscores, or hyphens, and not use reserved ids.');
    }
    if (usedIds.has(id)) {
      throw new Error(`LINKABLE_REMDO_SERVERS_JSON contains duplicate server id ${id}.`);
    }
    usedIds.add(id);

    const tokenBaseUrl = readOptionalOrigin(server, 'tokenBaseUrl');
    return {
      id,
      label: readString(server, 'label'),
      baseUrl: readOrigin(server, 'baseUrl'),
      ...(tokenBaseUrl ? { tokenBaseUrl } : {}),
      clientId: readString(server, 'clientId'),
      clientSecret: readString(server, 'clientSecret'),
    };
  });
}

export function getLinkableRemdoServers(): LinkableRemdoServer[] {
  return parseLinkableRemdoServers(config.env.LINKABLE_REMDO_SERVERS_JSON);
}
