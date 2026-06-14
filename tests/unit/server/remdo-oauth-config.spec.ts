import { describe, expect, it } from 'vitest';
import { parseLinkableRemdoServers } from '#server/remdo-oauth/config';

describe('remdo oauth server config', () => {
  it('returns no servers for an empty config', () => {
    expect(parseLinkableRemdoServers('')).toEqual([]);
  });

  it('parses configured linkable RemDo servers', () => {
    expect(parseLinkableRemdoServers(JSON.stringify([
      {
        id: 'source',
        label: 'Source Server',
        baseUrl: 'https://source.example',
        clientId: 'source-client-id',
        clientSecret: 'source-client-secret',
      },
    ]))).toEqual([
      {
        id: 'source',
        label: 'Source Server',
        baseUrl: 'https://source.example',
        clientId: 'source-client-id',
        clientSecret: 'source-client-secret',
      },
    ]);
  });

  it('parses a separate token endpoint origin for Docker-hosted clients', () => {
    expect(parseLinkableRemdoServers(JSON.stringify([
      {
        id: 'source',
        label: 'Source Server',
        baseUrl: 'https://source.example',
        tokenBaseUrl: 'http://host.docker.internal:5000',
        clientId: 'source-client-id',
        clientSecret: 'source-client-secret',
      },
    ]))).toEqual([
      {
        id: 'source',
        label: 'Source Server',
        baseUrl: 'https://source.example',
        tokenBaseUrl: 'http://host.docker.internal:5000',
        clientId: 'source-client-id',
        clientSecret: 'source-client-secret',
      },
    ]);
  });

  it('rejects malformed server ids', () => {
    expect(() => parseLinkableRemdoServers(JSON.stringify([
      {
        id: 'server.a',
        label: 'Source Server',
        baseUrl: 'https://source.example',
        clientId: 'source-client-id',
        clientSecret: 'source-client-secret',
      },
    ]))).toThrow('letters, numbers, underscores, or hyphens');
  });

  it('rejects the reserved local server id', () => {
    expect(() => parseLinkableRemdoServers(JSON.stringify([
      {
        id: 'local',
        label: 'Source Server',
        baseUrl: 'https://source.example',
        clientId: 'source-client-id',
        clientSecret: 'source-client-secret',
      },
    ]))).toThrow('reserved ids');
  });

  it('rejects non-exact server origins', () => {
    expect(() => parseLinkableRemdoServers(JSON.stringify([
      {
        id: 'source',
        label: 'Source Server',
        baseUrl: 'https://source.example/path',
        clientId: 'source-client-id',
        clientSecret: 'source-client-secret',
      },
    ]))).toThrow('exactly match a URL origin');
  });

  it('rejects unparseable server origins with an actionable error', () => {
    expect(() => parseLinkableRemdoServers(JSON.stringify([
      {
        id: 'source',
        label: 'Source Server',
        baseUrl: 'not a url',
        clientId: 'source-client-id',
        clientSecret: 'source-client-secret',
      },
    ]))).toThrow('valid URL origin');
  });

  it('rejects malformed JSON with an actionable error', () => {
    expect(() => parseLinkableRemdoServers('[{ not valid json }]')).toThrow('valid JSON');
  });

  it('rejects non-string fields', () => {
    expect(() => parseLinkableRemdoServers(JSON.stringify([
      {
        id: 'source',
        label: 'Source Server',
        baseUrl: 'https://source.example',
        clientId: 123,
        clientSecret: 'source-client-secret',
      },
    ]))).toThrow('string clientId');
  });

  it('rejects duplicate server ids', () => {
    expect(() => parseLinkableRemdoServers(JSON.stringify([
      {
        id: 'source',
        label: 'Source Server',
        baseUrl: 'https://a.example',
        clientId: 'source-client-id-a',
        clientSecret: 'source-client-secret-a',
      },
      {
        id: 'source',
        label: 'Other Source Server',
        baseUrl: 'https://b.example',
        clientId: 'source-client-id-b',
        clientSecret: 'source-client-secret-b',
      },
    ]))).toThrow('duplicate server id source');
  });
});
