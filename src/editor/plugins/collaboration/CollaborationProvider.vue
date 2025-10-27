<script setup lang="ts">
import { onScopeDispose } from 'vue';
import { pushCollaborationContext } from './collaborationContext';
import { provideCollaborationStatus } from './collaborationStatus';

const restoreCollaborationContext = pushCollaborationContext();
provideCollaborationStatus();

onScopeDispose(restoreCollaborationContext);
</script>

<template>
  <slot />
</template>
