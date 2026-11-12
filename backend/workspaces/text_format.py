"""The RemDo text format (docs/format.md): Markdown read into a tree of notes, and written back.

The tree holds a document, outline notes (headings included) and bodies, each note with its own
lines as written. A body holds any other Markdown verbatim.
"""

import dataclasses
import datetime
import re
from dataclasses import dataclass, field

from markdown_it import MarkdownIt

# Deep enough for any outline people write; the parser's default of 20 levels drops content
# nested past nine list levels, which would leave part of a document unread.
MAX_NESTING = 400
NAME = re.compile(r"^(.*?[^\\\s])::(?: |$)")
PROPERTY = re.compile(r"^id::(?: |$)")
CHECKBOX = re.compile(r"^\[([ xX])\](?:[ \t]+|$)")
MARKS = {"strong": "bold", "em": "italic", "s": "strike"}
MARK_ORDER = ("bold", "italic", "strike", "underline")
OPEN = {"bold": "**", "italic": "*", "strike": "~~", "underline": "<u>"}
CLOSE = {"bold": "**", "italic": "*", "strike": "~~", "underline": "</u>"}
DATE = re.compile(r"^date:(\d{4})-(\d{2})-(\d{2})$")
# The note ID alphabet (docs/specs/outliner/note-ids.md): no `-` or `_`, at most 20 characters.
NOTE_ID = re.compile(r"[A-Za-z0-9]{1,20}")
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

_markdown = MarkdownIt("commonmark", {"maxNesting": MAX_NESTING}).enable("strikethrough")
# Reading keeps every link target as written: markdown-it's checks and encoding exist for rendering
# HTML, and would turn `file:` links into text and `café.md` into `caf%C3%A9.md`.
_markdown.validateLink = lambda url: True
_markdown.normalizeLink = lambda url: url
_markdown.normalizeLinkText = lambda url: url


@dataclass
class Run:
    kind: str  # text, link, date or verbatim
    text: str = ""
    marks: tuple = ()
    href: str = ""
    runs: list = field(default_factory=list)


@dataclass
class Note:
    kind: str  # outline or body
    source: list = field(default_factory=list)  # the note's own lines as written
    marker: tuple = ("bullet",)  # ("bullet",), ("number", start or None) or ("heading", level)
    checkbox: str | None = None  # open or checked
    name: str | None = None
    runs: list = field(default_factory=list)
    id: str | None = None
    children: list = field(default_factory=list)

    @property
    def text(self):
        return "\n".join(self.source)


@dataclass
class Document:
    id: str | None = None
    children: list = field(default_factory=list)


def read(source):
    """The document a Markdown text reads as; any text reads as one."""
    lines = source.replace("\r\n", "\n").replace("\r", "\n").removesuffix("\n").split("\n")
    document = Document()
    parsed = lines
    first_line = 0
    if lines and lines[0] == "---" and "---" in lines[1:]:
        end = lines.index("---", 1)
        document.children.append(Note("body", lines[: end + 1]))
        parsed = ["" if index <= end else line for index, line in enumerate(lines)]
        first_line = end + 1
    tokens = _markdown.parse("\n".join(parsed))
    _Reader(lines, tokens, first_line).section(document)
    return document


class _Reader:
    def __init__(self, lines, tokens, first_line):
        self.lines = lines
        self.tokens = tokens
        self.first_line = first_line
        self.identified = set()

    def section(self, document):
        sections = [(0, document)]

        def owner():
            return sections[-1][1]

        def heading(index):
            token = self.tokens[index]
            level = int(token.tag[1:])
            while len(sections) > 1 and sections[-1][0] >= level:
                sections.pop()
            inline = self.tokens[index + 1]
            source = [line.strip() for line in self.lines[token.map[0] : token.map[1]]]
            note = Note("outline", source, ("heading", level))
            self.fill(note, inline.content, inline)
            owner().children.append(note)
            sections.append((level, note))

        self.blocks(0, len(self.tokens), owner, 0, heading)

    def blocks(self, start, end, owner, indent, on_heading=None, region=None):
        """Read tokens[start, end) as an owner's blocks: a document's or heading's, or a list
        item's lines `region`. Lines no token covers, such as content nested past the parser's
        limit, are kept as a body rather than dropped."""
        in_item = region is not None
        last = region[0] if region else self.first_line
        body = None

        def flush():
            nonlocal body
            if body is None:
                return
            segments, holder = body
            lines = []
            for index, (first, stop, quoted) in enumerate(segments):
                if index:
                    lines.extend("" for _ in range(segments[index - 1][1], first))
                raw = self.lines[first:stop]
                lines.extend(
                    [re.sub(r"^\s*>\s?", "", line) for line in raw]
                    if quoted
                    else _dedent(raw, indent)
                )
            holder.children.append(Note("body", lines))
            body = None

        def add(first, stop, quoted):
            # Adjacent blocks form one body, as the format says.
            nonlocal body
            if body and body[1] is owner() and first >= body[0][-1][1]:
                body[0].append((first, stop, quoted))
            else:
                flush()
                body = ([(first, stop, quoted)], owner())

        index = start
        while index < end:
            token = self.tokens[index]
            if token.nesting == -1 or token.map is None:
                index += 1
                continue
            first, stop = token.map
            if last is not None and any(line.strip() for line in self.lines[last:first]):
                add(last, first, False)
            last = stop
            close = _close_of(self.tokens, index) if token.nesting == 1 else index
            if token.type == "heading_open" and on_heading:
                flush()
                on_heading(index)
            elif token.type in ("bullet_list_open", "ordered_list_open"):
                flush()
                self.list(index, close, owner())
            else:
                add(first, stop, in_item and token.type == "blockquote_open")
            index = close + 1
        tail = region[1] if region else len(self.lines)
        if last is not None and any(line.strip() for line in self.lines[last:tail]):
            add(last, tail, False)
        flush()

    def list(self, open_index, close, owner):
        ordered = self.tokens[open_index].type == "ordered_list_open"
        start = self.tokens[open_index].attrGet("start")
        number = 1 if start is None else int(start)
        first = True
        index = open_index + 1
        while index < close:
            if self.tokens[index].type == "list_item_open":
                item_close = _close_of(self.tokens, index)
                marker = (
                    ("number", number if first and number != 1 else None)
                    if ordered
                    else ("bullet",)
                )
                # A property line isn't a child, so the first note after it keeps its number.
                if self.item(index, item_close, owner, marker):
                    first = False
                number += 1
                index = item_close
            index += 1

    def item(self, open_index, close, owner, marker):
        line = self.tokens[open_index].map[0]
        after = self.tokens[open_index + 1] if open_index + 1 < close else None
        inline = None
        if after is not None and after.type == "paragraph_open" and after.map[0] == line:
            inline = self.tokens[open_index + 2]
        content = inline.content if inline else ""
        unboxed = CHECKBOX.sub("", content, count=1)
        if PROPERTY.match(unboxed.split("\n")[0]):
            # A property's first line takes effect even when its value has none; later ones are ignored.
            if id(owner) not in self.identified:
                self.identified.add(id(owner))
                text = _plain(_strip_prefix(inline.children or [], CHECKBOX))
                value = text.partition("::")[2].strip()
                if NOTE_ID.fullmatch(value):
                    owner.id = value
            return False
        indent = _item_indent(self.lines[line])
        if inline:
            text_end = _close_of(self.tokens, open_index + 1) + 1
            stop = self.tokens[open_index + 1].map[1]
            source = _dedent(
                self.lines[line:stop], len(self.lines[line]) - len(self.lines[line].lstrip())
            )
        else:
            text_end = open_index + 1
            stop = line + 1
            source = [self.lines[line][:indent].strip()]
            if after is not None and after.map and after.map[0] == line:
                # A block starting on the marker's line is a child; it reads without the marker.
                stop = line
                self.lines[line] = " " * indent + self.lines[line][indent:]
        note = Note("outline", source, marker)
        checkbox = CHECKBOX.match(content)
        if checkbox:
            note.checkbox = "open" if checkbox.group(1) == " " else "checked"
            content = content[checkbox.end() :]
        self.fill(note, content, inline, bool(checkbox))
        owner.children.append(note)
        region = (stop, self.tokens[open_index].map[1])
        self.blocks(text_end, close, lambda: note, indent, region=region)
        return True

    def fill(self, note, content, inline, checkbox=False):
        if inline is None:
            return
        tokens = inline.children or []
        if checkbox:
            tokens = _strip_prefix(tokens, CHECKBOX)
        name = _looks_named(content)
        if name:
            note.name = name.group(1)
            tokens = _strip_prefix(tokens, re.compile(re.escape(note.name) + r"::\s?"))
            content = content[name.end() :]
        note.runs = _runs(tokens, content)


def _runs(tokens, content):
    unmodelled = next(
        (
            token
            for token in tokens
            if token.type in ("image", "hardbreak")
            or (token.type == "html_inline" and not re.fullmatch(r"</?u>", token.content))
            or (token.type == "link_open" and token.markup == "autolink")
        ),
        None,
    )
    if unmodelled:
        # A hard break keeps the text on its lines; other continuation lines join into one.
        if unmodelled.type == "hardbreak":
            source = "\n".join(line.lstrip() for line in content.strip().split("\n"))
        else:
            source = re.sub(r"\n\s*", " ", content).strip()
        return [Run("verbatim", source)]
    top = []
    target = top
    marks = []
    in_date = False

    def push(text, extra=()):
        if not text:
            return
        current = tuple(sorted(set(marks) | set(extra)))
        if target and target[-1].kind == "text" and target[-1].marks == current:
            target[-1].text += text
        else:
            target.append(Run("text", text, current))

    for token in tokens:
        mark = (
            "underline"
            if token.type == "html_inline"
            else MARKS.get(re.sub(r"_(open|close)$", "", token.type))
        )
        if in_date:
            in_date = token.type != "link_close"
        elif mark:
            if token.nesting == 1 or token.content == "<u>":
                marks.append(mark)
            elif mark in marks:
                marks.reverse()
                marks.remove(mark)
                marks.reverse()
        elif token.type == "text":
            push(token.content)
        elif token.type == "softbreak":
            push(" ")
        elif token.type == "code_inline":
            push(token.content, ("code",))
        elif token.type == "link_open":
            href = token.attrGet("href") or ""
            found = _date(href)
            if found:
                # A date's label is presentation: it reads as its date, labelled as tools write it.
                label = f"{found.day} {MONTHS[found.month - 1]} {found.year}"
                top.append(Run("date", label, href=href[5:]))
                in_date = True
            else:
                link = Run("link", href=href)
                top.append(link)
                target = link.runs
        elif token.type == "link_close":
            target = top
    return _trim(_normalize(top))


def _normalize(runs):
    """Whitespace at the edge of a marked span carries no mark, as tools move marks off it."""
    out = []
    segment = []

    def flush():
        for mark in MARK_ORDER:
            index = 0
            while index < len(segment):
                if mark not in segment[index][1]:
                    index += 1
                    continue
                end = index
                while end < len(segment) and mark in segment[end][1]:
                    end += 1
                for edge in (range(index, end), range(end - 1, index - 1, -1)):
                    for i in edge:
                        if not (isinstance(segment[i][0], str) and segment[i][0].isspace()):
                            break
                        segment[i][1].discard(mark)
                index = end
        pieces = []  # runs, or [marks, characters] for text, joined once at the end
        for char, marks in segment:
            if not isinstance(char, str):
                pieces.append(char)
                continue
            key = tuple(sorted(marks))
            if pieces and isinstance(pieces[-1], list) and pieces[-1][0] == key:
                pieces[-1][1].append(char)
            else:
                pieces.append([key, [char]])
        out.extend(
            Run("text", "".join(piece[1]), piece[0]) if isinstance(piece, list) else piece
            for piece in pieces
        )
        segment.clear()

    for run in runs:
        if run.kind == "text":
            segment.extend((char, set(run.marks)) for char in run.text)
        elif run.kind == "link":
            run.runs = _normalize(run.runs)
            # A link whose label carries a mark doesn't end that mark's span around it.
            segment.append((run, _shared_marks(run)))
        else:
            flush()
            out.append(run)
    flush()
    return out


def _shared_marks(link):
    texts = [run for run in link.runs if run.kind == "text"]
    return set.intersection(*(set(run.marks) for run in texts)) - {"code"} if texts else set()


def _trim(runs):
    """Whitespace at a text's edges isn't Text, but a code span's own spaces are its content."""
    if runs and runs[0].kind == "text" and "code" not in runs[0].marks:
        runs[0].text = runs[0].text.lstrip()
    if runs and runs[-1].kind == "text" and "code" not in runs[-1].marks:
        runs[-1].text = runs[-1].text.rstrip()
    return [run for run in runs if run.kind != "text" or run.text]


def _date(href):
    found = DATE.match(href)
    if not found:
        return None
    try:
        return datetime.date(*(int(part) for part in found.groups()))
    except ValueError:
        return None


def _plain(tokens):
    return "".join(
        " " if token.type == "softbreak" else token.content
        for token in tokens
        if token.type in ("text", "code_inline", "softbreak")
    )


def _strip_prefix(tokens, pattern):
    if not tokens or tokens[0].type != "text":
        return tokens
    first = tokens[0].copy()
    first.content = pattern.sub("", first.content, count=1)
    return [first, *tokens[1:]]


def _close_of(tokens, open_index):
    close = re.sub(r"_open$", "_close", tokens[open_index].type)
    level = tokens[open_index].level
    index = open_index + 1
    while tokens[index].type != close or tokens[index].level != level:
        index += 1
    return index


def _item_indent(line):
    match = re.match(r"^(\s*)([-*+]|\d+[.)])(\s*)(\S?)", line)
    if not match:
        return 0
    indent, marker, spaces, text = match.groups()
    # CommonMark: content after a blank marker line, or after an indented code start, sits one
    # column past the marker.
    return len(indent) + len(marker) + (len(spaces) if text and len(spaces) <= 4 else 1)


def _dedent(lines, limit):
    widths = [len(line) - len(line.lstrip()) for line in lines if line.strip()]
    width = min([limit, *widths])
    return [line[min(width, len(line) - len(line.lstrip())) :] for line in lines]


def _looks_named(text):
    """Text that reads as `name:: text`: a plain name, free of Markdown, before an unescaped `::`."""
    match = NAME.match(text)
    return match if match and not re.search(r"[*_`\[\]<&\\]", match.group(1)) else None


def write(document):
    """The canonical text of a document: what tools write, which reads back as the same tree."""
    out = []
    _owner_children(document.children, document.id, out)
    return "\n".join(out) + "\n" if out else ""


def _owner_children(children, note_id, out):
    """A document's or heading's children: its first body, then its ID, then the rest."""
    if children and children[0].kind == "body":
        _section(children[:1], out)
        children = children[1:]
    if note_id is not None:
        _separate(out)
        out.append(f"- id:: {note_id}")
    _section(children, out)


def _first_number(note):
    if note.marker[0] != "number":
        return 0
    return (1 if note.marker[1] is None else note.marker[1]) - 1


def _starts_new_list(note, previous):
    """A numbered note with its own start after numbered siblings begins another list."""
    return note.marker[0] == "number" and previous == "number" and note.marker[1] is not None


def _separate(out):
    if out and out[-1] != "":
        out.append("")


def _section(children, out):
    in_list = False
    numbered = 0
    previous = None
    delimiter = "."
    for child in children:
        if child.kind == "body":
            _separate(out)
            out.extend(child.source)
            in_list = False
        elif child.marker[0] == "heading":
            _separate(out)
            text = _note_text(child)
            # Trailing `#`s after a space would read as the heading's closing sequence.
            text = re.sub(r"(^|[ \t])(#+)([ \t]*)$", r"\1\\\2\3", text)
            out.append(f"{'#' * child.marker[1]} {text}".rstrip())
            _owner_children(child.children, child.id, out)
            in_list = False
        else:
            if not in_list:
                _separate(out)
            if _starts_new_list(child, previous if in_list else None):
                # Only a new delimiter starts another numbered list right after one.
                delimiter = ")" if delimiter == "." else "."
                numbered = _first_number(child)
            elif not in_list or previous != child.marker[0]:
                numbered = _first_number(child)
                delimiter = "."
            numbered += 1
            _item(child, "", numbered, out, delimiter)
            in_list = True
            previous = child.marker[0]


def _item(note, indent, number, out, delimiter="."):
    marker = f"{number}{delimiter}" if note.marker[0] == "number" else "-"
    box = "" if note.checkbox is None else "[x] " if note.checkbox == "checked" else "[ ] "
    text = _note_text(note)
    inner = indent + " " * max(4, len(marker) + 1)
    first, *more = text.split("\n")
    out.append(f"{indent}{marker} {box}{first}".rstrip())
    out.extend(f"{inner}{line}" for line in more)
    rest = note.children
    under_text = False
    if rest and rest[0].kind == "body":
        out.extend(f"{inner}> {line}".rstrip() for line in rest[0].source)
        rest = rest[1:]
        under_text = True
    if note.id is not None:
        out.append(f"{inner}- id:: {note.id}")
        under_text = True
    numbered = 0
    previous = None
    delimiter = "."
    after_children = False
    for child in rest:
        if child.kind == "body":
            out.append("")
            out.extend(f"{inner}> {line}".rstrip() for line in child.source)
            previous = None
            after_children = True
            continue
        directly_under_text = not under_text and not after_children and text
        empty = _note_text(child) == "" and child.checkbox is None
        # Only `1.` can interrupt a paragraph, so another first number needs a blank line before it.
        late_start = child.marker[0] == "number" and child.marker[1] not in (None, 1)
        if directly_under_text and (empty or late_start):
            out.append("")
        if _starts_new_list(child, previous):
            delimiter = ")" if delimiter == "." else "."
            numbered = _first_number(child)
        elif previous != child.marker[0]:
            numbered = _first_number(child)
            delimiter = "."
        numbered += 1
        _item(child, inner, numbered, out, delimiter)
        previous = child.marker[0]
        after_children = True


def _note_text(note):
    text = write_runs(note.runs, line_start=True)
    if note.name is not None:
        return f"{note.name}:: {text}".rstrip()
    return text.replace("::", "\\::", 1) if _looks_named(text) else text


def write_runs(runs, line_start=False):
    out = []
    open_marks = []
    at_start = line_start

    def retarget(wanted):
        while any(mark not in wanted for mark in open_marks):
            out.append(CLOSE[open_marks.pop()])
        for mark in MARK_ORDER:
            if mark in wanted and mark not in open_marks:
                out.append(OPEN[mark])
                open_marks.append(mark)

    for index, run in enumerate(runs):
        if run.kind == "link":
            following = runs[index + 1] if index + 1 < len(runs) else None
            continuing = set(following.marks) if following and following.kind == "text" else set()
            retarget(_shared_marks(run) & (set(open_marks) | continuing))
            href = f"<{run.href}>" if re.search(r"[\s()<>]", run.href) else run.href
            label = [
                dataclasses.replace(
                    inner, marks=tuple(m for m in inner.marks if m not in open_marks)
                )
                for inner in run.runs
            ]
            out.append(f"[{write_runs(label)}]({href})")
        elif run.kind == "text":
            retarget(set(run.marks))
            out.append(_code(run.text) if "code" in run.marks else _escape(run.text, at_start))
        else:
            retarget(set())
            out.append(
                run.text if run.kind == "verbatim" else f"[{_escape(run.text)}](date:{run.href})"
            )
        at_start = False
    retarget(set())
    return "".join(out)


def _code(text):
    longest = max((len(match) for match in re.findall(r"`+", text)), default=0)
    fence = "`" * (longest + 1)
    padded = (
        longest > 0
        or text.startswith("`")
        or text.endswith("`")
        or (text.startswith(" ") and text.endswith(" ") and text.strip(" "))
    )
    return f"{fence} {text} {fence}" if padded else f"`{text}`"


def _escape(text, at_line_start=False):
    escaped = re.sub(r"([\\`*_\[\]<&~])", r"\\\1", text)
    if at_line_start:
        escaped = re.sub(r"^([#>+-])", r"\\\1", escaped)
        escaped = re.sub(r"^(\d+)([.)])", r"\1\\\2", escaped)
    return escaped
