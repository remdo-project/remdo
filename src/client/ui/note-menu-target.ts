import type { RefObject } from 'react';
import { useEffect } from 'react';

const targetEvent = 'remdo-note-menu-target';

export function isNoteMenuOpen(): boolean {
  return !!document.querySelector('[role="menu"], [role="dialog"]');
}

export function activateNoteMenuTarget(element: HTMLElement) {
  if (!element.closest('[data-note-menu-scope]')) element.dataset.menuActive = 'true';
  element.dispatchEvent(new Event(targetEvent, { bubbles: true }));
}

export function useNoteMenuTarget(scopeRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const scope = scopeRef.current!;
    scope.dataset.noteMenuScope = '';
    let active: HTMLElement | null = null;
    const activate = (target: HTMLElement) => {
      if (active === target) return;
      active?.removeAttribute('data-menu-active');
      active = target;
      active.dataset.menuActive = 'true';
    };
    const resolve = (event: Event) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('.note-menu-target') : null;
      if (target && scope.contains(target)) activate(target);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!isNoteMenuOpen()) resolve(event);
    };
    const restore = () => {
      if (active?.isConnected && active.getClientRects().length) return;
      active?.removeAttribute('data-menu-active');
      active = null;
      const targets = Array.from(scope.querySelectorAll<HTMLElement>('.note-menu-target'))
        .filter((target) => target.getClientRects().length > 0);
      const first = targets.find((target) => target.dataset.menuActive === 'true') ?? targets[0];
      if (first) activate(first);
    };
    scope.addEventListener('pointermove', onPointerMove);
    scope.addEventListener('focusin', resolve);
    scope.addEventListener('keydown', resolve, true);
    scope.addEventListener(targetEvent, resolve);
    const observer = new MutationObserver(restore);
    observer.observe(scope, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    restore();
    return () => {
      observer.disconnect();
      active?.removeAttribute('data-menu-active');
      delete scope.dataset.noteMenuScope;
      scope.removeEventListener('pointermove', onPointerMove);
      scope.removeEventListener('focusin', resolve);
      scope.removeEventListener('keydown', resolve, true);
      scope.removeEventListener(targetEvent, resolve);
    };
  }, [scopeRef]);
}
