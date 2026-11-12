import dataclasses
import re
from pathlib import Path

from django.test import SimpleTestCase
from markdown_it import MarkdownIt

from . import text_format

REPO = Path(__file__).resolve().parents[2]
RENDERER = MarkdownIt("commonmark", {"maxNesting": text_format.MAX_NESTING}).enable("strikethrough")

HOSTILE = """\
- id\\:: x
- \\# not a heading
- 1\\. not a number
- \\> not a quote
- \\*not emphasis\\*
- \\[not a link\\](y)
- ends in a backslash \\\\
- foo\\:: not a name
- name:: a named note
- a `code` span and `` ` `` backticks
- **bold *both* bold** and ~~struck~~
- <u>under</u> and **<u>both</u>**
- [link **bold**](note:abc) and [9 Jul 2026](date:2026-07-09)
- **bold [around](note:abc) a link**
- an ![image](x.png) here
- an <https://example.com> autolink
- a & ampersand < angle
    - id:: abc
3. starts at three
4. four
- back to bullets
    1. nested number
    - nested bullet after number
- [ ] open
- [x] done
    > body line one
    >
    > body line three
    - child after body
    > body after child
- a [reference link][ref] here

[ref]: https://example.com/ref
"""


def _rendered(source):
    """markdown-it's HTML with inline markup kept and whitespace dropped, to compare two texts."""
    html = RENDERER.render(source)
    html = re.sub(r"<(/?)(strong|em|s|u|code)>", lambda m: f"\x01{m[1]}{m[2]}\x02", html)
    # A date's label is presentation, so a date link compares by its target alone.
    html = re.sub(r'<a href="(date:[^"]*)">.*?</a>', lambda m: f"\x01a {m[1]}\x02", html)
    html = re.sub(r'<a href="([^"]*)">', lambda m: f"\x01a {m[1]}\x02", html).replace(
        "</a>", "\x01/a\x02"
    )
    html = re.sub(r'<img src="([^"]*)"[^>]*>', lambda m: f"\x01img {m[1]}\x02", html)
    return re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", html))


def _tree(document):
    """A document's reading, leaving out outline notes' lines as written, which writing respells."""

    def note(node):
        fields = dataclasses.asdict(node)
        if node.kind == "outline":
            del fields["source"]
        fields["children"] = [note(child) for child in node.children]
        return fields

    return document.id, [note(child) for child in document.children]


class RoundTripTests(SimpleTestCase):
    def assert_round_trips(self, source, name):
        written = text_format.write(text_format.read(source))
        reread = text_format.read(written)
        self.assertEqual(_tree(reread), _tree(text_format.read(source)), name)
        self.assertEqual(text_format.write(reread), written, name)
        self.assertEqual(_rendered(written), _rendered(source), name)

    def test_fixtures_and_repository_documents_read_back_as_written(self):
        files = sorted(REPO.glob("tests/fixtures/*.md")) + sorted(REPO.glob("docs/**/*.md"))
        self.assertTrue(files)
        for path in files:
            with self.subTest(path=str(path.relative_to(REPO))):
                self.assert_round_trips(path.read_text(encoding="utf8"), path.name)

    def test_escapes_marks_links_and_bodies_read_back_as_written(self):
        self.assert_round_trips(HOSTILE, "hostile")

    def test_ignored_and_invalid_id_lines_are_dropped(self):
        written = text_format.write(
            text_format.read(
                "- twice\n    - id:: first\n    - id:: second\n- bad\n    - id:: two words\n"
            )
        )
        self.assertEqual(written, "- twice\n    - id:: first\n- bad\n")

    def test_canonical_spelling(self):
        cases = {
            "* a\n* b\n": "- a\n- b\n",
            "1. a\n1. b\n": "1. a\n2. b\n",
            "- a\n  continued\n": "- a continued\n",
            "- __bold__ and _it_\n": "- **bold** and *it*\n",
            "- ** bold **\n": "- \\*\\* bold \\*\\*\n",
            "- **bold **after\n": "- \\*\\*bold \\*\\*after\n",
            "# Title #\n": "# Title\n",
        }
        for source, expected in cases.items():
            with self.subTest(source=source):
                self.assertEqual(text_format.write(text_format.read(source)), expected)


class ReadingTests(SimpleTestCase):
    def test_any_text_reads(self):
        for source in (
            "",
            "no final newline",
            "- a\r\n- b\r\n",
            "-\ta\n\t- b\n",
            "".join("    " * depth + f"- level {depth}\n" for depth in range(60)),
            "- - nested on one line\n",
            "<div>\n\nhtml\n</div>\n",
            "```\n- not a list\n```\n",
        ):
            with self.subTest(source=source[:30]):
                text_format.write(text_format.read(source))

    def test_content_nested_past_the_parsers_limit_is_kept_as_a_body(self):
        source = "".join("    " * depth + f"- level {depth}\n" for depth in range(260))
        notes, depth = text_format.read(source).children, 0
        while notes and notes[-1].kind == "outline":
            depth += 1
            notes = notes[-1].children
        self.assertGreater(depth, 100)
        self.assertIn("level 259", "\n".join(notes[-1].source))

    def test_deep_nesting_keeps_every_note(self):
        source = "".join("    " * depth + f"- level {depth}\n" for depth in range(60))
        notes = text_format.read(source).children
        depth = 0
        while notes:
            depth += 1
            notes = notes[0].children
        self.assertEqual(depth, 60)

    def test_notes_carry_their_lines_as_written(self):
        document = text_format.read(
            "- id:: doc\n\n# Trip\n\nIntro\n\n* [x] pack:: bags\n    > body\n    - id:: k3x9\n"
        )
        [heading] = document.children
        body, pack = heading.children
        self.assertEqual((document.id, heading.text, body.text), ("doc", "# Trip", "Intro"))
        self.assertEqual(
            (pack.text, pack.checkbox, pack.name, pack.id),
            ("* [x] pack:: bags", "checked", "pack", "k3x9"),
        )
        self.assertEqual([child.text for child in pack.children], ["body"])

    def test_a_notes_first_id_line_decides_its_id(self):
        cases = {
            "- a\n    - id:: two words\n    - id:: good\n": None,
            "- a\n    - [ ] id:: boxed\n": "boxed",
            "- a\n    - id:: a\\_b\n": None,
            "- a\n    - id:: &#120;\n": "x",
            "- a\n    - id:: a\n      b\n": None,
            "- a\n    - id:: a/b\n": None,
        }
        for source, expected in cases.items():
            with self.subTest(source=source):
                [note] = text_format.read(source).children
                self.assertEqual((note.id, note.children), (expected, []))

    def test_a_date_reads_as_its_date_with_the_canonical_label(self):
        written = text_format.write(text_format.read("- due [Jan 1](date:2026-07-09)\n"))
        self.assertEqual(written, "- due [9 Jul 2026](date:2026-07-09)\n")
        invalid = "- [x](date:2026-13-40)\n"
        self.assertEqual(text_format.write(text_format.read(invalid)), invalid)

    def test_front_matter_is_the_documents_first_body(self):
        source = "---\ntitle: Trip\n---\n\n# Trip\n"
        document = text_format.read(source)
        self.assertEqual(document.children[0].source, ["---", "title: Trip", "---"])
        self.assertEqual(text_format.write(document), source)

    def test_a_numbered_list_keeps_a_first_number_other_than_one(self):
        source = "- parent\n\n    3. three\n    4. four\n"
        [note] = text_format.read(source).children
        self.assertEqual(
            [child.marker for child in note.children], [("number", 3), ("number", None)]
        )
        self.assertEqual(text_format.write(text_format.read(source)), source)

    def test_a_block_after_a_list_items_text_is_one_body(self):
        [note] = text_format.read("- a\n\n    paragraph\n\n    > quote\n").children
        self.assertEqual([child.kind for child in note.children], ["body"])
