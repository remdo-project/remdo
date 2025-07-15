import { LexicalEditor } from "lexical";

export function patch(Class, methodName: string, newMethod) {
  if (methodName in Class.prototype) {
    //bound method
    const oldMethod = Class.prototype[methodName];
    Class.prototype[methodName] = function (...args) {
      return newMethod.bind(this)(oldMethod.bind(this), ...args);
    };
  } else {
    //static method
    const oldMethod = Class[methodName];
    Class[methodName] = function (...args) {
      return newMethod(oldMethod, ...args);
    };
  }
}

/**
 *  Function mimics li::before:hover css rule which is currently not supported
 * by browsers.
 * In the current use cases Y is already checked by the li:hover rule,
 * so we can focus only on X
 */
export function isBeforeEvent(element: HTMLElement, event: MouseEvent) {
  const beforeStyle = window.getComputedStyle(element, "::before");
  const liRect = element.getBoundingClientRect();

  return Math.abs(event.x - liRect.x) < parseFloat(beforeStyle.width) - 1;
}

/**
 * returns coordinates used to position a floating element (like note controls
 * menu) relatively to an existing element (like list item) and offsets them by
 * the editor's root element which has position: relative
 */
export function getOffsetPosition(
  editor: LexicalEditor,
  element: Element | Range
) {
  const { x, y, height } = element.getBoundingClientRect();
  const { x: aX, y: aY } = editor.getRootElement().getBoundingClientRect();
  return {
    left: x - aX,
    top: y - aY,
    height,
  };
}
