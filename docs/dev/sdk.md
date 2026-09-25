# SDK design

This document owns SDK contributor principles and API conventions. The
[consumer API principles](../principles.md#consumer-apis) define the goal; the [open document](../specs/outliner/open-document.md) and feature
specifications own accepted behavior.

## Design principles

- Simplicity covers the whole consumer lifecycle. Identity, freshness, lifetime,
  completion, observation, error recovery, and cleanup contribute to the API's
  cost alongside successful operations. Fewer caller responsibilities and fewer
  opportunities for silent misuse matter more than shorter calls.
- Consistency follows semantics. Established models are useful where their
  behavior and runtime assumptions fit; addressed interaction and readonly
  queries can justify different representations within a coherent API.
- Design evidence reflects real usage and is reproducible. Executable examples
  make required setup, error handling, and observation visible; focused
  lifecycle coverage supports the guarantees those examples rely on. Rationale
  that depends on external implementation details identifies the source release
  or commit.

## API conventions

Fallible reads use explicit methods; mutations have separate semantic operations.
The naming defaults are `getX()` for state reads, `canX()` for eligibility, and
semantic verbs for operations, including `setX(value)` for assignment. Related
methods follow the same conventions.

Direct reads of locally available note state are synchronous. Asynchronous
operations have an explicit completion contract.

## References

- [W3C Web Platform Design Principles](https://www.w3.org/TR/design-principles/) — primary design reference for live versus
  static objects, fallible reads, overloads, and timing. These principles apply
  independently of its browser-specific interfaces and event machinery.
- [VS Code API](https://code.visualstudio.com/api/references/vscode-api#TextEditor) and [Extension API guidelines](https://github.com/microsoft/vscode/wiki/Extension-API-guidelines) — supporting examples of local reads
  and awaitable edits. Closed document objects are not reused on reopening;
  extension-host assumptions and global event conventions do not define RemDo's
  lifetime or observation rules.
- [VS Code Extension API process](https://github.com/microsoft/vscode/wiki/Extension-API-process) — realistic examples, multiple use cases, and
  consumer trials before stabilization. RemDo's [compatibility](../../CONTRIBUTING.md#backward-compatibility-pre-10) and
  [delivery policy](../../CONTRIBUTING.md#git-workflow) remain locally owned.
- [MobX-state-tree references](https://mobx-state-tree.js.org/concepts/references) — identifier resolution and invalid-reference
  errors. A captured model node differs from a resolving reference; its reactive
  machinery and invalidation policies are not RemDo's lifetime contract.
- [ProseMirror commands](https://prosemirror.net/docs/guide/#commands) — boolean applicability checks without execution.
  They receive a usable editor state; they do not define unavailable-source
  behavior or guarantee that a later operation takes effect.
- [BlockNote content API](https://www.blocknotejs.org/docs/reference/editor/manipulating-content) and [events](https://www.blocknotejs.org/docs/reference/editor/events) — ID-based operations, read-time block data,
  and content/selection observation. These do not supply live per-note
  references or all contextual eligibility notifications.
- [tldraw Editor](https://tldraw.dev/sdk-features/editor), [Store](https://tldraw.dev/sdk-features/store), and [Signals](https://tldraw.dev/sdk-features/signals) — IDs, data reads, semantic operations, and
  reactive consumers. Copying its API shape does not supply its reactive
  runtime; synchronous mutations do not determine RemDo's completion semantics.
- [Firestore references](https://firebase.google.com/docs/reference/js/firestore.documentreference), [operations](https://firebase.google.com/docs/reference/js/firestore), and [listeners](https://firebase.google.com/docs/firestore/query-data/listen) — separation of identity from
  delivered data. Asynchronous snapshots and backend-acknowledged writes
  illustrate different freshness and completion guarantees from the
  open document.
