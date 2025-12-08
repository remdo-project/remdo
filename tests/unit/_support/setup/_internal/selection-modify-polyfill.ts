const proto = Selection.prototype as Selection & { modify?: unknown };

if (typeof proto.modify === 'function') {
  throw new TypeError(
    'Test env now supports Selection.modify; remove selection-modify polyfill and rely on the native implementation.'
  );
}

(proto as Selection & { modify?: () => void }).modify = () => {};
