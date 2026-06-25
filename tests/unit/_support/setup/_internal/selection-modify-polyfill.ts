// TODO: jsdom does not implement `Selection.modify`. Self-healing — the guard
// below throws once the test env provides it natively, prompting removal.
const proto = Selection.prototype as Selection & { modify?: unknown };

if (typeof proto.modify === 'function') {
  throw new TypeError(
    'Test env now supports Selection.modify; remove selection-modify polyfill and rely on the native implementation.'
  );
}

(proto).modify = () => {};
