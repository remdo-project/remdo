# Contributing

## Runtime Baseline

RemDo only targets the runtimes declared in `package.json`:

- **Node.js:** see `package.json#engines.node`.
- **Browsers:** see `package.json#browserslist` (production + development targets).

### Implications

1. **No legacy shims.** Assume the DOM/JS APIs shipped in those engines are available. Don’t add defensive checks that only make sense for older browsers (for example `typeof selection.extend === 'function'`). Use the API directly or document a real compatibility issue before adding guards.
2. **Modern syntax is fine.** Feel free to use Stage-4 ECMAScript features supported by the browserslist (optional chaining, nullish coalescing, `??=`, etc.) without back-compat branches.
3. **Tests should reflect the baseline.** When reproducing bugs, rely on jsdom + the supported engines. Don’t introduce polyfills that mask incompatibilities outside the supported set.

Refer to this section whenever compatibility concerns come up; if you need to support a new platform, update `package.json` first so the baseline stays authoritative.
