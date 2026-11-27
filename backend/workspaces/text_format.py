"""The RemDo text format (docs/format.md): Markdown read into a tree of notes, and written back.

The tree holds a document, outline notes (headings included) and bodies, each note with its own
lines as written. A body holds any other Markdown verbatim.
"""

import dataclasses
import datetime
import json
import re
from collections import deque
from dataclasses import dataclass, field

from markdown_it import MarkdownIt

# Deep enough for any outline people write; the parser's default of 20 levels drops content
# nested past nine list levels, which would leave part of a document unread.
MAX_NESTING = 400
NAME = re.compile(r"^(.*?[^\\\s])::(?: |$)")
PROPERTY = re.compile(r"^id::(?: |$)")
# A quote line without `>` continues a paragraph lazily, so its indent is not content.
QUOTE = re.compile(r"^\s*(?:>\s?)?")
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
    source: list = field(
        default_factory=list
    )  # its lines; a body's lose list-item quoting and indent
    marker: tuple = ("bullet",)  # ("bullet",), ("number", start or None) or ("heading", level)
    checkbox: str | None = None  # open or checked
    name: str | None = None
    runs: list = field(default_factory=list)
    id: str | None = None
    children: list = field(default_factory=list)
    cache_id: str | None = None  # the note's ID in its document's Yjs state, which the text omits
    # Where a read note sits in `lines_of` its file; `span` is None when a child starts on its
    # marker's line.
    span: tuple | None = field(default=None, compare=False, repr=False)
    prefix: str = field(default="", compare=False, repr=False)
    id_line: int | None = field(default=None, compare=False, repr=False)

    @property
    def text(self):
        return "\n".join(self.source)


@dataclass
class Document:
    id: str | None = None
    children: list = field(default_factory=list)
    id_line: int | None = field(default=None, compare=False, repr=False)
    property_lines: set = field(default_factory=set, compare=False, repr=False)


def lines_of(source):
    """A text's lines, as the reader numbers them."""
    return source.replace("\r\n", "\n").replace("\r", "\n").removesuffix("\n").split("\n")


def id_line(note_id):
    return f"- id:: {note_id}"


def read(source):
    """The document a Markdown text reads as; any text reads as one."""
    lines = lines_of(source)
    document = Document()
    parsed = lines
    first_line = 0
    if lines and lines[0] == "---" and "---" in lines[1:]:
        end = lines.index("---", 1)
        document.children.append(Note("body", lines[: end + 1], span=(0, end + 1)))
        parsed = ["" if index <= end else line for index, line in enumerate(lines)]
        first_line = end + 1
    tokens = _markdown.parse("\n".join(parsed))
    _Reader(lines, tokens, first_line, document.property_lines).section(document)
    return document


class _Reader:
    def __init__(self, lines, tokens, first_line, property_lines):
        self.lines = lines
        self.tokens = tokens
        self.first_line = first_line
        self.property_lines = property_lines
        self.identified = set()
        self.shared_lines = set()  # marker lines a note shares with its first child

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
            note = Note("outline", source, ("heading", level), span=tuple(token.map))
            self.fill(note, inline.content, inline)
            owner().children.append(note)
            sections.append((level, note))

        self.blocks(0, len(self.tokens), owner, 0, heading)

    def blocks(self, start, end, owner, indent, on_heading=None, region=None):
        """Read tokens[start, end) as an owner's children: a document's or heading's, or a list
        item's lines `region`. Headings and list items divide them; everything else between, lines
        no token covers included, is one body."""
        last, tail = region or (self.first_line, len(self.lines))
        body = []
        body_first = body_stop = None
        body_prefix = ""

        def flush():
            nonlocal body
            if body:
                span = None if body_first in self.shared_lines else (body_first, body_stop)
                owner().children.append(Note("body", body, span=span, prefix=body_prefix))
                body = []

        def add(first, stop, quoted=False, code=False):
            nonlocal body_first, body_stop, body_prefix
            raw = self.lines[first:stop]
            if quoted:
                lines = [QUOTE.sub("", line) for line in raw]
            else:
                # Outside a list item, indent short of code means nothing, and kept it would join
                # the body to a list item written before it.
                lines = _dedent(raw, indent if region or code else 3)
            lead = next((i for i, line in enumerate(lines) if line.strip()), len(lines))
            trail = next((i for i, line in enumerate(reversed(lines)) if line.strip()), 0)
            if lead == len(lines):
                return
            if body:
                body.extend([""] * min(first + lead - body_stop, 1))
            else:
                body_first = first + lead
                body_prefix = raw[lead][: len(raw[lead]) - len(lines[lead])]
            body.extend(lines[lead : len(lines) - trail])
            body_stop = stop - trail

        index = start
        while index < end:
            token = self.tokens[index]
            if token.nesting == -1 or token.map is None:
                index += 1
                continue
            first, stop = token.map
            add(last, first)
            last = stop
            close = _close_of(self.tokens, index) if token.nesting == 1 else index
            if token.type == "heading_open" and on_heading:
                flush()
                on_heading(index)
            elif token.type in ("bullet_list_open", "ordered_list_open"):
                self.list(index, close, owner(), flush)
            else:
                # Under a list item, a quote only wraps its body.
                quoted = region is not None and token.type == "blockquote_open"
                add(first, stop, quoted, token.type == "code_block")
            index = close + 1
        add(last, tail)
        flush()

    def list(self, open_index, close, owner, before_note):
        """Read a list's items into `owner`. Property lines aren't children, so the body being
        gathered ends only at the first note, `before_note` closing it."""
        ordered = self.tokens[open_index].type == "ordered_list_open"
        start = self.tokens[open_index].attrGet("start")
        number = 1 if start is None else int(start)
        first = True
        index = open_index + 1
        while index < close:
            if self.tokens[index].type == "list_item_open":
                item_close = _close_of(self.tokens, index)
                inline = self._property_inline(index, item_close)
                if inline is not None:
                    self.property_lines.add(self.tokens[index].map[0])
                    self._property(inline, owner, self.tokens[index].map[0])
                else:
                    before_note()
                    marker = ("bullet",)
                    if ordered:
                        # A list right after numbered notes starts again, even at 1, as Markdown
                        # numbers it.
                        previous = owner.children[-1] if owner.children else None
                        restarts = previous is not None and previous.marker[0] == "number"
                        marker = ("number", number if first and (number != 1 or restarts) else None)
                    self.item(index, item_close, owner, marker)
                    first = False
                number += 1
                index = item_close
            index += 1

    def _inline_of(self, open_index):
        """The inline token of the paragraph on a list item's marker line, if any."""
        line = self.tokens[open_index].map[0]
        after = self.tokens[open_index + 1]
        if after.type == "paragraph_open" and after.map[0] == line:
            return self.tokens[open_index + 2]
        return None

    def _property_inline(self, open_index, close):
        """The inline token of a property line: a list item holding only `id:: value` on one line."""
        inline = self._inline_of(open_index)
        if inline is None or "\n" in inline.content or close != open_index + 4:
            return None
        return inline if PROPERTY.match(CHECKBOX.sub("", inline.content, count=1)) else None

    def _property(self, inline, owner, line):
        # A property's first line takes effect even when its value has none; later ones are ignored.
        if id(owner) not in self.identified:
            self.identified.add(id(owner))
            owner.id_line = line
            text = _plain(_strip_prefix(inline.children or [], CHECKBOX))
            value = text.partition("::")[2].strip()
            if NOTE_ID.fullmatch(value):
                owner.id = value

    def item(self, open_index, close, owner, marker):
        line = self.tokens[open_index].map[0]
        after = self.tokens[open_index + 1]
        inline = self._inline_of(open_index)
        content = inline.content if inline else ""
        indent = _item_indent(self.lines[line])
        lead = len(self.lines[line]) - len(self.lines[line].lstrip())
        if inline:
            text_end = _close_of(self.tokens, open_index + 1) + 1
            stop = self.tokens[open_index + 1].map[1]
            source = _dedent(self.lines[line:stop], lead)
            # A lazy continuation line indented less than the marker dedents the note by less.
            lead = len(self.lines[line]) - len(source[0])
        else:
            text_end = open_index + 1
            stop = line + 1
            source = [self.lines[line][:indent].strip()]
            if after.map and after.map[0] == line:
                # A block starting on the marker's line is a child; it reads without the marker.
                stop = line
                self.lines[line] = " " * indent + self.lines[line][indent:]
                self.shared_lines.add(line)
        span = (line, stop) if stop > line and line not in self.shared_lines else None
        prefix = self.lines[line][:lead]
        note = Note("outline", source, marker, span=span, prefix=prefix)
        checkbox = CHECKBOX.match(content)
        if checkbox:
            note.checkbox = "open" if checkbox.group(1) == " " else "checked"
            content = content[checkbox.end() :]
        self.fill(note, content, inline, bool(checkbox))
        owner.children.append(note)
        region = (stop, self.tokens[open_index].map[1])
        self.blocks(text_end, close, lambda: note, indent, region=region)

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
                top.append(Run("date", _date_label(found), href=href[5:]))
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


def _date_label(date):
    return f"{date.day} {MONTHS[date.month - 1]} {date.year}"


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


MARKER_FIELDS = {"number": "start", "heading": "level"}


def to_json(document):
    """The outline tree Node converts Yjs state to and from (src/headless/outline-tree/tree.ts)."""
    return {"id": document.id, "children": [_note_json(note) for note in document.children]}


def _note_json(note):
    if note.kind == "body":
        return {"kind": "body", "source": list(note.source), "cacheId": note.cache_id}
    kind, *value = note.marker
    marker = {"kind": kind}
    if kind in MARKER_FIELDS:
        marker[MARKER_FIELDS[kind]] = value[0]
    return {
        "kind": "outline",
        "marker": marker,
        "checkbox": note.checkbox,
        "name": note.name,
        "runs": [_run_json(run) for run in note.runs],
        "id": note.id,
        "cacheId": note.cache_id,
        "children": [_note_json(child) for child in note.children],
    }


def _run_json(run):
    if run.kind == "text":
        return {"kind": "text", "text": run.text, "marks": sorted(run.marks)}
    if run.kind == "link":
        return {"kind": "link", "href": run.href, "runs": [_run_json(inner) for inner in run.runs]}
    if run.kind == "date":
        return {"kind": "date", "date": run.href}
    return {"kind": "verbatim", "text": run.text}


def from_json(data):
    """The document an outline tree from Node holds."""
    return Document(data["id"], [_note_from_json(note) for note in data["children"]])


def _note_from_json(data):
    if data["kind"] == "body":
        return Note("body", list(data["source"]), cache_id=data["cacheId"])
    marker = data["marker"]
    kind = marker["kind"]
    return Note(
        "outline",
        marker=(kind, marker[MARKER_FIELDS[kind]]) if kind in MARKER_FIELDS else (kind,),
        checkbox=data["checkbox"],
        name=data["name"],
        runs=[_run_from_json(run) for run in data["runs"]],
        id=data["id"],
        children=[_note_from_json(child) for child in data["children"]],
        cache_id=data["cacheId"],
    )


def _run_from_json(data):
    kind = data["kind"]
    if kind == "text":
        return Run("text", data["text"], tuple(sorted(data["marks"])))
    if kind == "link":
        return Run("link", href=data["href"], runs=[_run_from_json(run) for run in data["runs"]])
    if kind == "date":
        return Run("date", _date_label(_date(f"date:{data['date']}")), href=data["date"])
    return Run("verbatim", data["text"])


def write(document, source=None):
    """A document's text: its canonical spelling, which reads back as the same tree, adjacent
    bodies joined into one; or, given `source`, an edit of that text reading as the canonical one
    does, unchanged when `source` already reads so."""
    canonical = _Writer().text(document)
    return canonical if source is None else edit(canonical, source, read(source))[0]


def edit(canonical, source, parsed, document=None):
    """`canonical`, a document's canonical text, which reads as `document`, written as an edit of
    `source`, which reads as `parsed` (docs/architecture.md, under Outline tree), with what the
    text written reads as: `source` itself when it reads as `canonical` does, notes reading as
    they do in it keeping their lines, and `canonical` when the edit wouldn't read as it does."""
    document = document or read(canonical)
    reading = to_json(document)
    if to_json(parsed) == reading:
        return source, parsed
    edited = _Writer(_Spellings(source, parsed)).text(document)
    edited_reading = read(edited)
    # Writing a reading again can read differently, so only the canonical text is sure to.
    if to_json(edited_reading) == reading:
        return edited, edited_reading
    return canonical, document


class _Spellings:
    """A text's notes by what they read as, each kept for one note of an edit."""

    def __init__(self, source, parsed):
        self.lines = lines_of(source)
        self.document = parsed
        self.unclaimed = {}
        # Indents past their parent list item's own: of the notes under one, and of ID lines;
        # and top-level list items' own.
        self.offsets = {}
        self.id_offsets = {}
        self.top_offsets = {}

        def gather(notes, parent):
            under_item = parent is not None and parent.marker[0] != "heading"
            for note in notes:
                if note.span is not None:
                    self.unclaimed.setdefault(_reads_as(note, under_item), deque()).append(note)
                    if under_item:
                        self.offsets[id(note)] = _past(_leading(note.prefix), parent.prefix)
                    elif parent is None and note.kind == "outline":
                        self.top_offsets[id(note)] = _leading(note.prefix)
                if note.kind == "outline" and note.id_line is not None:
                    line = self.lines[note.id_line]
                    self.id_offsets[id(note)] = _past(_leading(line), note.prefix)
                gather(note.children, note if note.kind == "outline" else None)

        gather(parsed.children, None)

    def unclaimed_like(self, note, under_item):
        return self.unclaimed.get(_reads_as(note, under_item)) or ()

    def peek(self, note, under_item):
        written = self.unclaimed_like(note, under_item)
        return written[0] if written else None

    def claim(self, note, under_item):
        written = self.unclaimed_like(note, under_item)
        return written.popleft() if written else None

    def blank_lines_before(self, line):
        first = line
        while first > 0 and not self.lines[first - 1].strip():
            first -= 1
        return line - first

    def body_lines(self, body):
        """A body's lines as written, from its indent on, with the property lines among them, which
        its owner writes, left blank."""
        start, stop = body.span
        indent = len(_leading(body.prefix))
        return [
            ""
            if index in self.document.property_lines
            else line[min(indent, len(_leading(line))) :]
            for index, line in enumerate(self.lines[start:stop], start)
        ]


def _leading(text):
    return text[: len(text) - len(text.lstrip())]


def _past(indent, prefix):
    return indent.removeprefix(prefix) if indent.startswith(prefix) else None


def _fits(offset, width):
    """Whether an indent past a list item's own puts a line in its content without making it code."""
    return offset is not None and width <= len(offset.expandtabs(4)) < width + 4


def _reads_as(note, under_item):
    if note.kind == "body":
        # A body's lines read as written only where they were: under a list item they lose quoting.
        return ("body", under_item, tuple(note.source))
    runs = json.dumps([_run_json(run) for run in note.runs])
    return ("outline", note.marker, note.checkbox, note.name, runs)


NUMBER = re.compile(r"\s*(\d+)([.)])")


class _Numbering:
    """The markers of a run of sibling notes, numbered as Markdown reads them."""

    def __init__(self):
        self.previous = None
        self.number = 0
        self.delimiter = "."

    def follows(self, note):
        """Number `note`, returning whether it continues a list, starts one, or starts one right
        after another numbered list, which only a new delimiter does."""
        place = "continues"
        if _starts_new_list(note, self.previous):
            self.delimiter = ")" if self.delimiter == "." else "."
            self.number = _first_number(note)
            place = "restarts"
        elif self.previous != note.marker[0]:
            self.number = _first_number(note)
            self.delimiter = "."
            place = "starts"
        self.number += 1
        self.previous = note.marker[0]
        return place

    def marker(self, note):
        return f"{self.number}{self.delimiter}" if note.marker[0] == "number" else "-"

    def kept(self, note, line, place):
        """`line`, a numbered note's kept first line, with a number and delimiter that read as
        the note's place: a list's first number is its start, and its delimiter ends the list
        before it."""
        written = NUMBER.match(line)
        number, delimiter = int(written[1]), written[2]
        fits = (place == "starts" or delimiter == self.delimiter) and (
            place == "continues" or number == self.number
        )
        if not fits:
            return line[: written.start(1)] + self.marker(note) + line[written.end() :]
        self.delimiter = delimiter
        return line


class _Writer:
    def __init__(self, spellings=None):
        self.spellings = spellings
        self.out = []
        self.origins = []  # each written line's index in the edited text, if it comes from there
        self.adjacent = False

    def text(self, document):
        owner = self.spellings.document if self.spellings else None
        self.owner_children(document.children, document.id, owner, at_start=True)
        return "\n".join(self.out) + "\n" if self.out else ""

    def put(self, line, origin=None):
        self.out.append(line)
        self.origins.append(origin)
        if line:
            self.adjacent = False

    def keep_blank_lines_before(self, line):
        """Write the blank lines the edited text has before its `line`, noting whether the line
        then follows what it follows there, so needs no other separation."""
        blanks = self.spellings.blank_lines_before(line)
        for _ in range(blanks - self.trailing_blanks()):
            self.put("")
        previous = next(
            (o for o, text in zip(reversed(self.origins), reversed(self.out)) if text), -1
        )
        self.adjacent = previous == line - blanks - 1

    def claim(self, note, under_item):
        written = self.spellings and self.spellings.claim(note, under_item)
        if written:
            self.keep_blank_lines_before(written.span[0])
        return written

    def trailing_blanks(self):
        count = 0
        while count < len(self.out) and self.out[-1 - count] == "":
            count += 1
        return count

    def separate(self):
        if self.out and self.out[-1] != "" and not self.adjacent:
            self.put("")

    def put_kept(self, written, lines, indent):
        for index, line in enumerate(lines, written.span[0]):
            self.put(indent + line if line.strip() else "", index)

    def put_id_line(self, note_id, written, indent="", separate=False):
        if written is not None and written.id == note_id and written.id_line is not None:
            self.keep_blank_lines_before(written.id_line)
            if separate:
                self.separate()
            self.put(indent + self.spellings.lines[written.id_line].strip(), written.id_line)
            return
        if separate:
            self.separate()
        self.put(indent + id_line(note_id))

    def owner_children(self, children, note_id, written, at_start=False):
        """A document's or heading's children after its ID, which follows only front matter."""
        if (
            at_start
            and children
            and children[0].kind == "body"
            and _is_front_matter(children[0].source)
        ):
            self.section(children[:1])
            children = children[1:]
        if note_id is not None:
            self.put_id_line(note_id, written, separate=True)
        self.section(children)

    def section(self, children):
        numbering = _Numbering()
        content_column = None
        for child in children:
            written = self.claim(child, under_item=False)
            if child.kind == "body":
                self.separate()
                if written:
                    self.put_kept(
                        written, self.spellings.body_lines(written), _leading(written.prefix)
                    )
                else:
                    for line in child.source:
                        self.put(line)
                numbering.previous = None
                content_column = None
            elif child.marker[0] == "heading":
                self.separate()
                if written:
                    self.put_kept(written, written.source, "")
                else:
                    text = _note_text(child)
                    # Trailing `#`s after a space would read as the heading's closing sequence.
                    text = re.sub(r"(^|[ \t])(#+)([ \t]*)$", r"\1\\\2\3", text)
                    self.put(f"{'#' * child.marker[1]} {text}".rstrip())
                self.owner_children(child.children, child.id, written)
                numbering.previous = None
                content_column = None
            else:
                if numbering.previous is None:
                    self.separate()
                indent = written and self.spellings.top_offsets.get(id(written))
                # Indented to the previous item's content, a kept item would nest under it.
                if not _fits(indent, 0) or (
                    content_column is not None and len(indent.expandtabs(4)) >= content_column
                ):
                    indent = ""
                start = len(self.out)
                self.item(child, indent, numbering, written)
                content_column = _item_indent(self.out[start].expandtabs(4))

    def item(self, note, indent, numbering, written):
        place = numbering.follows(note)
        text = _note_text(note)
        start = len(self.out)
        if written:
            lines = list(written.source)
            if note.marker[0] == "number":
                lines[0] = numbering.kept(note, lines[0], place)
            self.put_kept(written, lines, indent)
        else:
            marker = numbering.marker(note)
            box = "" if note.checkbox is None else "[x] " if note.checkbox == "checked" else "[ ] "
            if PROPERTY.match(text):
                # A list item named after a property would read as that property, losing the note.
                text = text.replace("::", "\\::", 1)
            continued = indent + " " * max(4, len(marker) + 1)
            first_line, *more = text.split("\n")
            self.put(f"{indent}{marker} {box}{first_line}".rstrip())
            for line in more:
                self.put(continued + line)
        width = _item_indent(self.out[start].lstrip().expandtabs(4))
        inner = indent + self.child_offset(note, written, width)
        rest = note.children
        first_body = rest[0] if rest and rest[0].kind == "body" else None
        under_text = first_body is not None or note.id is not None
        if first_body is not None:
            rest = rest[1:]
        # The ID line goes after the first body unless the edited text put it before.
        id_first = (
            written is not None
            and written.id_line is not None
            and written.children
            and written.children[0].kind == "body"
            and written.children[0].span is not None
            and written.id_line < written.children[0].span[0]
        )
        if note.id is not None and id_first:
            self.put_id_line(note.id, written, inner)
        if first_body is not None:
            self.body(first_body, indent, width, inner, after_text=not id_first)
        if note.id is not None and not id_first:
            self.put_id_line(note.id, written, inner)
        numbering = _Numbering()
        after_children = False
        for child in rest:
            if child.kind == "body":
                self.body(child, indent, width, inner)
                numbering.previous = None
                after_children = True
                continue
            child_written = self.claim(child, under_item=True)
            directly_under_text = not under_text and not after_children and text
            empty = _note_text(child) == "" and child.checkbox is None
            # Only `1.` can interrupt a paragraph, so another first number needs a blank line.
            late_start = child.marker[0] == "number" and child.marker[1] not in (None, 1)
            if directly_under_text and (empty or late_start):
                self.separate()
            offset = child_written and self.spellings.offsets.get(id(child_written))
            child_indent = indent + offset if _fits(offset, width) else inner
            self.item(child, child_indent, numbering, child_written)
            after_children = True

    def child_offset(self, note, written, width):
        """The indent past a note's own, `width` columns to its content, for its ID line, new
        children and canonically written bodies: what the edited text gave its ID line or
        children, or else what its first kept child had there, or else past its marker. Kept
        children and bodies keep their own."""
        for offset in self.file_offsets(note, written):
            if _fits(offset, width):
                return offset
        return " " * max(4, width)

    def file_offsets(self, note, written):
        if not self.spellings:
            return
        offsets = self.spellings.offsets
        if written:
            yield self.spellings.id_offsets.get(id(written))
            yield next((offsets[id(c)] for c in written.children if id(c) in offsets), None)
        for child in note.children:
            kept = self.spellings.peek(child, under_item=True)
            if kept:
                yield offsets.get(id(kept))
                return

    def body(self, body, indent, width, inner, after_text=False):
        """A body under a list item `width` columns to its content: kept bodies as written, and
        others quoted."""
        written = self.claim(body, under_item=True)
        if written:
            quoted = ">" in written.prefix
            # Unquoted text right after a note's own would continue it.
            if not (after_text and quoted):
                self.separate()
            offset = self.spellings.offsets.get(id(written))
            if _fits(offset, width):
                base = indent + offset
            else:
                base = inner if quoted else indent + " " * width
            self.put_kept(written, self.spellings.body_lines(written), base)
            return
        if not after_text:
            self.separate()
        for line in _quoted(body.source):
            self.put(inner + line)


def _is_front_matter(source):
    return len(source) > 1 and source[0] == source[-1] == "---"


def _first_number(note):
    if note.marker[0] != "number":
        return 0
    return (1 if note.marker[1] is None else note.marker[1]) - 1


def _starts_new_list(note, previous):
    """A numbered note with its own start after numbered siblings begins another list."""
    return note.marker[0] == "number" and previous == "number" and note.marker[1] is not None


def _quoted(source):
    return [f"> {line}" if line else ">" for line in source]


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
