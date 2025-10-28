<script setup lang="ts">
import { computed } from 'vue';

import EditorRoot from './editor/EditorRoot.vue';
import RemDoIcon from './icons/RemDoIcon.vue';

interface HostContext {
  protocol: string;
  hostname: string;
  basePort: number;
}

const host = resolveHost();

const previewUrl = computed(() => (host ? buildUrl(host, 3) : '#preview'));
const vitestUrl = computed(() => (host ? buildUrl(host, 2, '/__vitest__/') : '#vitest'));
const lexicalUrl = computed(() =>
  host ? `${host.protocol}//${host.hostname}:3000/?isCollab=true&collabEndpoint=ws://${host.hostname}:1234` : '#lexical',
);

function resolveHost(): HostContext | null {
  if (typeof window === 'undefined') return null;

  const { protocol, hostname, port } = window.location;
  const basePort = port && Number(port) > 0
    ? Number(port)
    : protocol === 'https:'
      ? 443
      : 80;

  return { protocol, hostname, basePort };
}

function buildUrl(host: HostContext, portOffset: number, path = ''): string {
  return `${host.protocol}//${host.hostname}:${host.basePort + portOffset}${path}`;
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-header-left">
        <h1 class="brand-heading">
          <a class="brand-link" href="/">
            <RemDoIcon class="brand-icon" />
            <span class="brand-title">RemDo</span>
          </a>
        </h1>
      </div>
      <nav class="app-header-links">
        <a class="app-header-link" :href="previewUrl">Preview</a>
        <a class="app-header-link" :href="vitestUrl">Vitest</a>
        <a class="app-header-link" :href="lexicalUrl">Lexical</a>
      </nav>
    </header>

    <main class="app-main">
      <EditorRoot />
    </main>
  </div>
</template>
