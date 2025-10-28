import { inject, provide } from 'vue';
import type { Doc } from 'yjs';

interface CollaborationContext {
  name: string;
  color: string;
  yjsDocMap: Map<string, Doc>;
  isCollabActive: boolean;
}

const entries: Array<[string, string]> = [
  ['Cat', 'rgb(125, 50, 0)'],
  ['Dog', 'rgb(100, 0, 0)'],
  ['Rabbit', 'rgb(150, 0, 0)'],
  ['Frog', 'rgb(200, 0, 0)'],
  ['Fox', 'rgb(200, 75, 0)'],
  ['Hedgehog', 'rgb(0, 75, 0)'],
  ['Pigeon', 'rgb(0, 125, 0)'],
  ['Squirrel', 'rgb(75, 100, 0)'],
  ['Bear', 'rgb(125, 100, 0)'],
  ['Tiger', 'rgb(0, 0, 150)'],
  ['Leopard', 'rgb(0, 0, 200)'],
  ['Zebra', 'rgb(0, 0, 250)'],
  ['Wolf', 'rgb(0, 100, 150)'],
  ['Owl', 'rgb(0, 100, 100)'],
  ['Gull', 'rgb(100, 0, 100)'],
  ['Squid', 'rgb(150, 0, 150)'],
];

const randomEntry = () => entries[Math.floor(Math.random() * entries.length)];

const collaborationContextKey = Symbol('LexicalCollaborationContext');

function createContext(): CollaborationContext {
  const [name, color] = randomEntry();

  return {
    name,
    color,
    yjsDocMap: new Map(),
    isCollabActive: false,
  };
}

const globalFallbackContext = createContext();

export function provideCollaborationContext(): CollaborationContext {
  const context = createContext();
  provide(collaborationContextKey, context);
  return context;
}

export function useCollaborationContext(
  username?: string,
  color?: string,
): CollaborationContext {
  const provided = inject<CollaborationContext | null>(collaborationContextKey, null);
  const context = provided ?? globalFallbackContext;

  if (username) {
    context.name = username;
  }

  if (color) {
    context.color = color;
  }

  return context;
}
