import { it } from 'vitest';

it.fails('fails when a warning is logged to the console', () => {
  console.warn('intentional warning to assert console guard');
});
