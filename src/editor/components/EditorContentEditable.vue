<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue';
import { useLexicalComposer } from 'lexical-vue/LexicalComposer';

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const editor = useLexicalComposer();
const root = ref<HTMLElement | null>(null);
const isEditable = ref(false);

const mergedAttrs = computed(() => {
  const { style: _style, prefix: _prefix, class: className, role, spellcheck, ...rest } = attrs;
  const classes = [className, 'editor-input'].filter(Boolean).join(' ');

  return {
    ...rest,
    class: classes || 'editor-input',
    role: role ?? 'textbox',
    spellcheck: spellcheck ?? true,
  } as Record<string, unknown>;
});

function syncRootElement(element: HTMLElement | null) {
  if (element) {
    editor.setRootElement(element);
    updateEditableState(element, isEditable.value);
  } else {
    editor.setRootElement(null);
  }
}

function updateEditableState(element: HTMLElement, editable: boolean) {
  element.setAttribute('contenteditable', editable ? 'true' : 'false');
  if (editable) {
    element.removeAttribute('aria-readonly');
  } else {
    element.setAttribute('aria-readonly', 'true');
  }
}

onMounted(() => {
  syncRootElement(root.value);
  isEditable.value = editor.isEditable();

  const unregister = editor.registerEditableListener((currentIsEditable) => {
    isEditable.value = currentIsEditable;
  });

  onBeforeUnmount(() => {
    unregister();
    editor.setRootElement(null);
  });
});

watch(root, (element) => {
  syncRootElement(element);
});

watch(isEditable, (editable) => {
  const element = root.value;
  if (element) {
    updateEditableState(element, editable);
  }
});
</script>

<template>
  <div ref="root" v-bind="mergedAttrs" />
</template>
