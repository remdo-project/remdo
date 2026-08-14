# Links

RemDo supports RemDo-owned [note links](./note-links.md) and generic URL links.
This specification owns classification between those kinds and generic URL-link
behavior. Generic links provide predictable, reversible URL authoring without
interpreting ambiguous text as a destination.

## Definitions

1. **Linkable email address:** one address accepted by the HTML email address
   syntax whose domain contains at least two labels. A Unicode domain is linkable
   when WHATWG URL host parsing normalizes it to an ASCII domain that satisfies
   those rules. Unicode local parts, display names, headers, queries, and
   fragments are not linkable.
2. **Scheme-less web address candidate:** a URL with no scheme whose non-IP
   hostname is accepted by WHATWG URL host parsing, contains at least two labels,
   and ends in a suffix from the IANA root zone. It may include credentials, a
   port, path, query, or fragment accepted by WHATWG URL parsing. These are
   syntactic candidates only; destination rules reject credentials before
   linking.

## Link kinds and classification

1. [Note links](./note-links.md) own stable RemDo note identity and interaction.
2. Generic URL links do not use note-link semantics.
3. RemDo classification runs before generic link handling so RemDo-owned note
   refs keep note-link identity/clipboard behavior instead of degrading into
   plain URL links.
4. URLs that merely resemble RemDo note routes but are not classified by
   RemDo as owned note refs are handled as generic URL candidates.

## Generic URL recognition

Automatic recognition deliberately accepts fewer scheme-less inputs than
explicit [generic URL authoring](#generic-url-authoring).

1. An automatic-recognition candidate starts at the beginning of inline text or
   after whitespace or an opening `(`, `[`, `{`, `<`, `"`, `'`, `“`, or `‘`.
   It ends before whitespace, an inline-node boundary, or an unescaped `<`, `>`,
   `"`, `“`, `”`, `‘`, or `’`.
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
7. Destinations produced by recognition or authoring use WHATWG URL serialization
   after any scheme inference; Copy destination returns that stored value.
8. Imported, persisted, and collaboration-state generic links are validated
   against the same destination rules and otherwise preserve their label and
   destination.

## Generic URL authoring

1. `Cmd/Ctrl+K` opens link controls for an unlinked collapsed caret, a wholly
   unlinked inline selection within one selection region, or a caret or selection
   contained in one existing generic-link occurrence. It is a no-op for a
   [structural selection](./selection.md#selection-states) or an inline selection
   overlapping linked and unlinked text or multiple link occurrences, and for a
   caret or selection in a note link. With selected unlinked text, the controls
   use that text as the initial label; at an existing generic link, Edit is
   initially active; at an unlinked collapsed caret, generic-link creation uses
   the entered destination as the initial label. A RemDo-owned note URL instead
   creates a note link under the
   [note-link insertion behavior](./note-links.md#core-behavior). For generic
   links, creation classifies a linkable email address before web inputs. It
   accepts an HTTP or HTTPS URL, a linkable email address, or a scheme-less web
   address candidate,
   applying the same credential and destination restrictions as automatic
   recognition and imported content. Email inputs receive a `mailto:` destination
   and scheme-less web inputs receive an `https://` destination.
2. Submitting a label with no non-whitespace character, or an unsupported or
   invalid destination, leaves the controls open, presents a validation error,
   and does not change the document. Changing a generic link's destination to a
   RemDo-owned note URL is invalid rather than converting the link's kind.
3. After RemDo-owned URL classification, pasting over selected text containing a
   non-whitespace character a destination accepted by the `Cmd/Ctrl+K` creation
   rules creates a generic link whose visible label remains the selected text.
4. Through link controls, editing a labeled link's destination preserves its
   label, and editing its label preserves its destination. Editing an
   automatically recognized link through the controls converts it to a labeled
   link and ends automatic text-to-destination synchronization.
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
   text range, or collapsed caret. A pinned range or link whose content changed
   while the controls were open is no longer valid. A pointer press elsewhere in
   the editor cancels the controls before applying the editor's ordinary
   pointer-selection behavior.
8. In creation mode, focus moves to the destination field. Invoking Edit also
   focuses the destination field. In either field mode, `Tab` cycles between the
   label and destination, and `Enter` commits both and closes. In existing-link
   action mode, controls expose Open, Copy destination, Edit, and Remove link;
   focus moves to Edit initially, `Tab` cycles through the actions, and `Enter`
   or a primary click invokes the active action. Open and Copy perform their
   non-document action and close; Remove commits immediately. A creation commit
   places the caret after the new link; an edit commit restores it to the link
   occurrence, and removal restores it to the remaining text.

## Generic URL presentation and activation

1. Generic links are identifiable and operable as links by assistive technology,
   show visible keyboard focus, and use a non-color visual distinction. Long URL
   text wraps without creating horizontal document scrolling.
2. In editable content, an ordinary primary click opens link controls without
   navigating. Shift takes precedence over `Cmd/Ctrl` on a primary click and
   retains its [structural-selection behavior](./selection.md#input-bindings)
   without activating the link. Otherwise, `Cmd/Ctrl`-click, middle-click, and
   the Open action activate the link directly.
3. HTTP and HTTPS links open in a new tab to preserve the active RemDo editing
   context. Their presentation communicates that behavior visually and to
   assistive technology, and the opened page receives no opener or referrer.
4. Link controls do not obstruct pointer interaction with inline content.
5. RemDo does not fetch external content or metadata merely because a URL was
   typed, pasted, displayed, or selected.

## Future

- Explicit external-link previews and alternate representations.

## References

- [GitHub Flavored Markdown autolinks](https://github.github.com/gfm/#autolinks-extension-)
- [HTML email address syntax](https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address)
- [WHATWG URL host parsing](https://url.spec.whatwg.org/#host-parsing)
- [IANA root-zone database](https://www.iana.org/domains/root/db)
- [RFC 9110 URI userinfo guidance](https://www.rfc-editor.org/rfc/rfc9110.html#section-4.2.4)
- [W3C guidance for links that open new windows](https://www.w3.org/WAI/WCAG21/Techniques/general/G201)
- [WHATWG guidance for secure URL handling](https://html.spec.whatwg.org/multipage/introduction.html#writing-secure-applications-with-html)
