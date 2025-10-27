<script setup lang="ts">
import { computed } from 'vue';
import Editor from './editor/Editor.vue';
import RemDoIcon from './icons/RemDoIcon.vue';

interface HostContext {
  protocol: string;
  hostname: string;
  basePort: number;
}

function resolveHost(): HostContext | null {
  if (typeof window === 'undefined') return null;

  const { protocol, hostname, port } = window.location;
  const basePort =
    port && Number(port) > 0
      ? Number(port)
      : protocol === 'https:'
        ? 443
        : 80;

  return { protocol, hostname, basePort };
}

function buildUrl(host: HostContext, portOffset: number, path = ''): string {
  return `${host.protocol}//${host.hostname}:${host.basePort + portOffset}${path}`;
}

const host = resolveHost();

const previewUrl = computed(() => (host ? buildUrl(host, 3) : '#preview'));
const vitestUrl = computed(() => (host ? buildUrl(host, 2, '/__vitest__/') : '#vitest'));
const lexicalUrl = computed(() =>
  host
    ? `${host.protocol}//${host.hostname}:3000/?isCollab=true&collabEndpoint=ws://${host.hostname}:1234`
    : '#lexical'
);
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <h1 class="app-heading">
        <a href="/" class="app-brand-link">
          <RemDoIcon class="app-brand-icon" />
          RemDo
        </a>
      </h1>
      <nav class="app-nav" aria-label="External tooling links">
        <a class="app-link" :href="previewUrl">Preview</a>
        <a class="app-link" :href="vitestUrl">Vitest</a>
        <a class="app-link" :href="lexicalUrl">Lexical</a>
      </nav>
    </header>

    <Editor />
  </div>
</template>
