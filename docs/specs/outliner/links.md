# Links

RemDo-owned note links preserve stable note identity and remain distinct from
generic URL links. Generic links provide predictable, reversible URL authoring
without interpreting ambiguous text as a destination.

## Definitions

1. **Runtime editor state:** the in-memory Lexical node state used by editor
   behavior and rendering.
2. **Persisted JSON state:** the JSON document shape written to/read from
   fixtures, snapshot files, and other long-lived storage boundaries.
3. **Clipboard payload:** transient copy/cut payload (`application/x-lexical-editor`)
   exchanged between editor contexts.
4. **Collaboration state:** shared runtime state (for example Yjs-backed) that
   must behave like runtime editor state while synced.
5. **`docId`:** the note-link field carrying the target document's canonical
   [document identity](../../architecture.md#document-identity).
6. **`noteId`:** the note-link field carrying the target note's [noteId](./note-ids.md#definitions).
7. **Linkable email address:** one address accepted by the HTML email address
   syntax whose domain contains at least two labels. A Unicode domain is linkable
   when WHATWG URL host parsing normalizes it to an ASCII domain that satisfies
   those rules. Unicode local parts, display names, headers, queries, and
   fragments are not linkable.
8. **Scheme-less web address candidate:** a URL with no scheme whose non-IP
   hostname is accepted by WHATWG URL host parsing, contains at least two labels,
   and ends in a suffix from the IANA root zone. It may include credentials, a
   port, path, query, or fragment accepted by WHATWG URL parsing. These are
   syntactic candidates only; destination rules reject credentials before
   linking.

## Core behavior

1. RemDo-owned links target stable note identity (`docId` + `noteId`), not the
   visible link text.
2. Generic URL links do not use RemDo note-link semantics.
3. RemDo classification runs before generic link handling so RemDo-owned note
   refs keep note-link identity/clipboard behavior instead of degrading into
   plain URL links.
4. Note links are created inline through `@`, an inline trigger character; its
   open/close/confirm lifecycle is the shared one in
   [Editor popups](./popups.md). The note-link spec defines only what differs.
5. The query is the text after `@` in the [pinned span](./popups.md#shared-editor-popup-contract), length minimum 0, so
   results may appear immediately. Whitespace is allowed in the query.
6. A note-link's insertion path chooses its display text, which is then stored
   locally; later target renames do not update it.
7. Note-link clicks use native `href` navigation semantics and route handling.
8. Creating a note link from a RemDo-owned plain-text note URL, by paste or link
   controls, inserts a note-link node. Its initial label is selected text when
   present, the target note title for an unselected target in the active document,
   or the entered URL string for another document. Paste commits that label
   directly; link controls expose it for editing and retain the edited value.
9. Typing a URL — including a same-origin RemDo note URL — does not create
   note-link identity; the note-link upgrade applies only to paste and link
   controls.
10. URLs that merely resemble RemDo note routes but are not classified by
    RemDo as owned note refs are handled as generic URL candidates.
11. Clipboard payloads (copy/cut) must include explicit `docId` for every
    note link so cross-context paste has complete target identity.
12. Cross-document pastes preserve source-target link identity; note links
    are not retargeted to the destination document.

## Identity Representation Boundaries

1. Runtime editor state keeps note links fully qualified (`docId` + `noteId`).
2. Persisted JSON state must omit `docId` when a link targets the active
   document. This keeps document identity host-owned rather than embedded as
   canonical content state.
3. At persisted->runtime boundaries (load/import), hosts must rehydrate missing
   same-document link `docId` values from the active `documentId` before
   parsing/applying state into the editor runtime.
4. Cross-document links keep explicit `docId` values unchanged across save/load.
5. Note/document identity ownership rules remain defined in [Note IDs](./note-ids.md).

## Query and ranking

1. Search scope is the whole active document, including in a [subtree view](./zoom.md#visibility-and-editing-boundary).
2. Filtering uses the same path-token matching as document search (defined in [Search](./search.md#behavior)).
3. When present, the [focus note](./selection.md#selection-states) is excluded
   from results (self-links are out of scope).
4. Picker rows show the minimal ancestor context needed to disambiguate duplicate
   titles in the current result set.
5. If results are still visually identical after full ancestor context, they
   remain untied and are shown in [document order](./note-model.md#definitions).
6. No-match state is a single non-selectable `No results...` row.
7. Creating new notes from the picker is out of scope.

## Picker interaction

The `@` picker is the type-to-filter specialization of the shared
[Editor popups](./popups.md) contract, and its typed query is the pinned span's editable text.
Navigation, confirmation, and dismissal are the shared lifecycle; note-link specifics:

1. The initial active option is the first result in document order.
2. `Enter` or a primary-button click commits the active option; `Tab` does not
   commit — it closes the picker and falls through to indent.
3. On the no-match state (the `No results...` row, with no active option),
   `Enter` closes the picker and leaves the typed `@query` as ordinary text — it
   neither inserts a link nor a newline.
4. Confirming inserts a note-link node (`docId` + `noteId`) whose display text is
   the target note title, plus a trailing space.

## Generic URL recognition

Automatic recognition deliberately accepts fewer scheme-less inputs than
explicit [generic URL authoring](#generic-url-authoring).

1. An automatic-recognition candidate starts at the beginning of inline text or
   after whitespace or an opening `(`, `[`, `{`, `<`, `"`, `'`, `“`, or `‘`.
   Recognition runs after paste or after following input establishes the end of
   the candidate, but does not reprocess content already handled by note-link or
   explicit generic-link paste rules. It preserves the authored text;
   normalization changes only the destination.
2. Automatic recognition creates generic links for:
   - absolute `http://` and `https://` URLs
   - scheme-less web address candidates whose hostname has at least three total
     labels including an initial `www` label, and whose destination passes the
     rules below, with an `https://` destination
   - linkable email addresses, with a `mailto:` destination
3. Automatic recognition leaves ambiguous or context-dependent forms as text,
   including other scheme-less domains, bare IP or `localhost` addresses,
   relative URLs, and protocol-relative (`//`) URLs.
4. A candidate whose resulting HTTP or HTTPS destination contains a username or
   password, or whose email destination contains headers, a query, or a fragment,
   remains text. Explicit creation and imported content reject it rather than
   stripping credentials or linking only part of the candidate.
5. Recognition excludes trailing `.`, `,`, `;`, `:`, `!`, `?`, `*`, `_`, `~`,
   `"`, `'`, `“`, `”`, `‘`, `’`, and `>` from the destination. Scanning the
   candidate in order, it retains a trailing `)`, `]`, or `}` only when an
   unclosed corresponding opener occurs earlier within the candidate; it excludes
   an unmatched trailing closer. A rejected or unsupported candidate remains
   entirely as text rather than becoming a partial link.
6. Generic link destinations are limited to HTTP, HTTPS, and `mailto:` containing
   exactly one linkable email address. A `mailto:` destination encodes its
   address so URL syntax cannot reinterpret local-part characters as a query,
   fragment, or other parameter. Unsupported or invalid destinations in imported
   content retain their visible text without an active link.
7. Imported, persisted, and collaboration-state generic links are validated
   against the same destination rules and otherwise preserve their label and
   destination.

## Generic URL authoring

1. `Cmd/Ctrl+K` opens link controls for an unlinked collapsed caret, a wholly
   unlinked inline selection within one note, or a caret or selection contained
   in one existing link occurrence. It is a no-op for a
   [structural selection](./selection.md#selection-states) or an inline selection
   overlapping linked and unlinked text or multiple link occurrences. With
   selected unlinked text, the controls use that text as the initial label; at an
   existing link, Edit is initially active; at an unlinked collapsed caret,
   generic-link creation uses the entered destination as the initial label. A
   RemDo-owned note URL instead creates a note link under the
   [core URL-insertion behavior](#core-behavior). For generic links, creation
   classifies a linkable email address before web inputs. It accepts an HTTP or
   HTTPS URL, a linkable email address, or a scheme-less web address candidate,
   applying the same credential and destination restrictions as automatic
   recognition and imported content. Email inputs receive a `mailto:` destination
   and scheme-less web inputs receive an `https://` destination.
2. Submitting a label with no non-whitespace character, or an unsupported or
   invalid destination, leaves the controls open, presents a validation error,
   and does not change the document.
3. After RemDo-owned URL classification, pasting over selected text containing a
   non-whitespace character a destination accepted by the `Cmd/Ctrl+K` creation
   rules creates a generic link whose visible label remains the selected text.
4. Through link controls, editing a labeled link's destination preserves its
   label, and editing its label preserves its destination.
5. Directly editing the inline text of an automatically recognized link updates
   its destination; when the complete text no longer matches, it becomes ordinary
   text.
6. Removing a link or undoing automatic recognition preserves its visible text
   and suppresses recognition for that inline occurrence across later editor
   updates, collaboration, persistence, and reload. Suppression belongs to the
   occurrence rather than its URL string, so identical text elsewhere is
   unaffected; it ends only when the occurrence's text changes. The immediate
   Undo removes only the link formatting and preserves the authored text.
7. Link controls are a structured chooser under the shared
   [Editor popups](./popups.md#shared-editor-popup-contract) contract. Opening
   pins a model-level authoring target: the existing link occurrence, selected
   text range, or collapsed caret. Before acting, the controls re-resolve the
   target and close without acting when it no longer exists. A pinned range or
   link whose content changed while the controls were open is similarly no longer
   valid. `Escape` cancels and restores the anchored selection. A pointer press
   elsewhere in the editor cancels the controls before applying the editor's
   ordinary pointer-selection behavior.
8. In creation mode, focus moves into label and destination fields. In either
   creation or existing-link Edit fields, `Tab` cycles between the fields and
   `Enter` commits both and closes. In existing-link action mode, controls expose
   Open, Copy destination, Edit, and Remove link; focus moves to Edit initially,
   `Tab` cycles through the actions, and `Enter` or a primary click invokes the
   active action. Open and Copy perform their non-document action and close;
   Remove commits immediately. A creation commit places the caret after the new
   link; an edit commit restores it to the link occurrence, and removal restores
   it to the remaining text.

## Generic URL presentation and activation

1. Generic links are identifiable and operable as links by assistive technology,
   show visible keyboard focus, and use a non-color visual distinction. Long URL
   text wraps without creating horizontal document scrolling.
2. In editable content, an ordinary primary click opens link controls without
   navigating. `Cmd/Ctrl`-click, middle-click, and the Open action activate the
   link directly; Shift-click retains its
   [structural-selection behavior](./selection.md#input-bindings).
3. HTTP and HTTPS links open in a new tab to preserve the active RemDo editing
   context. Their presentation communicates that behavior visually and to
   assistive technology, and the opened page receives no opener or referrer.
4. Link controls do not obstruct pointer interaction with inline content.
5. RemDo does not fetch external content or metadata merely because a URL was
   typed, pasted, displayed, or selected.

## Future

- Backlinks as part of the note-link model.
- Cross-document discovery and insertion in the `@` picker.
- Fuzzy picker matching and frecency-aware ranking influenced by zoom context.
- Rename-aware display text, including title mirroring unless customized.
- Cross-document link validation.
- Explicit external-link previews and alternate representations.

## References

- [GitHub Flavored Markdown autolinks](https://github.github.com/gfm/#autolinks-extension-)
- [HTML email address syntax](https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address)
- [WHATWG URL host parsing](https://url.spec.whatwg.org/#host-parsing)
- [IANA root-zone database](https://www.iana.org/domains/root/db)
- [RFC 9110 URI userinfo guidance](https://www.rfc-editor.org/rfc/rfc9110.html#section-4.2.4)
- [W3C guidance for links that open new windows](https://www.w3.org/WAI/WCAG21/Techniques/general/G201)
- [WHATWG guidance for secure URL handling](https://html.spec.whatwg.org/multipage/introduction.html#writing-secure-applications-with-html)
