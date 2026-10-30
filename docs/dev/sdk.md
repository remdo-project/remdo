# SDK design

This document owns SDK contributor principles and API conventions. The
[consumer API principles](../principles.md#consumer-apis) define the goal; the [open document](../specs/outliner/open-document.md) and feature
specifications own accepted behavior.

## Design principles

- Minimize the complexity of understanding, using, and maintaining the SDK and
  its consumers. Prefer abstractions that hide implementation decisions and make
  common tasks easy to perform correctly. Evaluate complete workflows, including
  failure, recovery, and cleanup. Additional implementation complexity is
  justified when it removes greater complexity from consumers. Keep behavioral
  guarantees explicit, including identity, freshness, and operation completion.
- Consistency follows semantics. Established models are useful where their
  behavior and runtime assumptions fit; addressed interaction and readonly
  queries can justify different representations within a coherent API.
- Design evidence reflects real usage and is reproducible. Rationale that
  depends on external implementation details identifies the source release or
  commit.

## Showcases

Each example teaches a clear consumer capability or semantic distinction through
public APIs, real implementations, and known fixtures. Prefer complementary
examples over exhaustive permutations, keeping required setup, error handling,
and observation visible. State the lesson in the example's name; brief comments
distinguish additional lessons within a shared workflow. Assertions keep
illustrations executable; focused tests own regression coverage. Adapter
construction and prototypes belong in ordinary tests or research.

## API conventions

Fallible reads use explicit methods; mutations have separate semantic operations.
The naming defaults are `getX()` for state reads, `canX()` for eligibility, and
semantic verbs for operations, including `setX(value)` for assignment. Related
methods follow the same conventions. Fixed child references use readonly named
properties; fallible state reads remain methods on those references.

Direct reads of locally available note state are synchronous. Asynchronous
operations have an explicit completion contract.

## Note kinds

A note kind supplies its data, structure, and operations to one shared note
implementation, which owns identity, kind narrowing, availability, observation,
and operation guards. Each kind keeps its named public interface under the
[API conventions](#api-conventions). A new kind using existing abilities adds
only that supply and interface; the SDK grows only for a new category of
ability, which later kinds reuse.

## References

- [Parnas: On the Criteria To Be Used in Decomposing Systems into Modules](https://www.cs.lafayette.edu/~gexia/cs301/resources/parnas.html)
  — information hiding to localize implementation decisions and their changes.
- [Ousterhout: Modular Design](https://web.stanford.edu/~ouster/cgi-bin/cs190-spring16/lecture.php?topic=modularDesign) — simple interfaces, behavioral obligations,
  and absorbing complexity within modules to simplify their consumers.
- [W3C Web Platform Design Principles](https://www.w3.org/TR/design-principles/) — primary design reference for live versus
  static objects, fallible reads, overloads, timing, and simplicity for common use
  cases. These principles apply
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
