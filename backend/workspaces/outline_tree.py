"""Outline trees with cache IDs (docs/architecture.md, under Outline tree and Workspace document
state): the cache IDs Apply gives a tree's notes, and a document's current tree."""

import copy
import json

from django.db import transaction

from . import models


def stripped(tree):
    """`tree` without its cache IDs, as a tree read from text holds none."""
    if isinstance(tree, dict):
        return {key: None if key == "cacheId" else stripped(value) for key, value in tree.items()}
    if isinstance(tree, list):
        return [stripped(item) for item in tree]
    return tree


def same(tree, other):
    """Whether two trees read alike, cache IDs aside."""
    if isinstance(tree, dict):
        return (
            isinstance(other, dict)
            and tree.keys() == other.keys()
            and all(key == "cacheId" or same(value, other[key]) for key, value in tree.items())
        )
    if isinstance(tree, list):
        return isinstance(other, list) and len(tree) == len(other) and all(map(same, tree, other))
    return tree == other


def current(tree, reading):
    """A document's current tree, given its file's `reading` and the tree its cache row holds, if
    any: that tree while it reads as the file, or else the reading with the cache IDs matching it
    to that tree gives."""
    return tree if tree is not None and same(tree, reading) else match(reading, tree)


def kept(workspace, reading):
    """The current tree of `workspace`'s document, whose file reads as `reading`, which its cache
    row then holds."""
    with transaction.atomic():
        rows = _locked(workspace)
        tree = rows.values_list("tree", flat=True).first()
        result = current(tree, reading)
        if result is not tree:
            _store(workspace, rows, result)
    return result


def keep(workspace, tree):
    """Keep `tree` on `workspace`'s cache row, leaving the row's state and the version it builds on
    to the room."""
    with transaction.atomic():
        _store(workspace, _locked(workspace), tree)


def _locked(workspace):
    # The room's saves write the row under the same lock.
    if models.Workspace.objects.select_for_update().filter(pk=workspace.pk).first() is None:
        raise models.Workspace.DoesNotExist
    return models.DocumentState.objects.filter(workspace=workspace)


def _store(workspace, rows, tree):
    if not rows.update(tree=tree):
        models.DocumentState.objects.create(workspace=workspace, state=b"", tree=tree)


def match(tree, base=None):
    """`tree` with the cache IDs Apply gives its notes when applying it to a document holding
    `base`, mirroring $applyTree in src/headless/outline-tree/apply.ts."""
    result = copy.deepcopy(tree)
    base = copy.deepcopy(base) if base is not None else {"id": None, "children": []}
    matching = _Matching()
    for item in in_order(base["children"]):
        cache_id = item["cacheId"]
        if cache_id is None:
            continue
        if cache_id in matching.live:
            matching.set_cache_id(item, matching.fresh())
        else:
            matching.live[cache_id] = item
    matching.by_ids(result["children"])
    matching.children(base["children"], result["children"])
    # A later note's written ID can renew an earlier one's, so cache IDs are read at the end.
    for note, item in matching.pairs:
        note["cacheId"] = item["cacheId"]
    return result


class _Matching:
    def __init__(self):
        self.live = {}  # cache ID -> the base note holding it
        self.kept = set()  # base notes claimed, by id()
        self.targets = {}  # id() of a tree note -> the base note it updates
        self.owners = {}  # written ID -> the tree note it belongs to: the first to give it
        self.pairs = []

    def fresh(self):
        while True:
            cache_id = models.workspace_id()
            if cache_id not in self.live:
                return cache_id

    def set_cache_id(self, item, cache_id):
        previous = item["cacheId"]
        if previous is not None and self.live.get(previous) is item:
            del self.live[previous]
        item["cacheId"] = cache_id
        self.live[cache_id] = item

    def claim(self, note, item):
        if item is None or id(item) in self.kept or id(note) in self.targets:
            return
        self.kept.add(id(item))
        self.targets[id(note)] = item

    def by_ids(self, notes):
        """Match notes to the base notes holding their written IDs, then their cache IDs."""
        ordered = list(in_order(notes))
        for note in ordered:
            note_id = note.get("id")
            if note_id is None or note_id in self.owners:
                continue
            self.owners[note_id] = note
            holder = self.live.get(note_id)
            if holder is not None and holder.get("id") is not None:
                self.claim(note, holder)
        for note in ordered:
            if note["cacheId"] is not None:
                self.claim(note, self.live.get(note["cacheId"]))

    def children(self, current, notes):
        position = {id(item): index for index, item in enumerate(current)}
        matched = [self.targets.get(id(note)) for note in notes]
        self.by_content(current, position, notes, matched)
        for note, item in zip(notes, matched, strict=True):
            if item is None:
                cache_id = note["cacheId"]
                item = {"cacheId": None, "children": []}
                self.set_cache_id(
                    item,
                    cache_id
                    if cache_id is not None and cache_id not in self.live
                    else self.fresh(),
                )
                self.kept.add(id(item))
            self.pairs.append((note, item))
            if note["kind"] == "outline":
                self.claim_written_id(item, note)
                if note["children"]:
                    self.children(item.get("children", []), note["children"])

    def by_content(self, current, position, notes, matched):
        """Give notes no ID matched an unclaimed sibling with the same content, in order after the
        last matched sibling; never by position alone."""
        if all(item is not None for item in matched):
            return
        unclaimed = {}
        for item in current:
            if id(item) not in self.kept:
                unclaimed.setdefault(_content(item), []).append(item)
        after = -1
        for index, note in enumerate(notes):
            target = matched[index]
            if target is not None:
                after = max(after, position.get(id(target), after))
                continue
            candidates = unclaimed.get(_content(note))
            if not candidates:
                continue
            later = (i for i, item in enumerate(candidates) if position[id(item)] > after)
            item = candidates.pop(next(later, 0))
            matched[index] = item
            self.kept.add(id(item))
            after = max(after, position[id(item)])

    def claim_written_id(self, item, note):
        """A written ID claims its value, even from a note holding it only as its cache ID."""
        note_id = note["id"]
        if note_id is None or self.owners.get(note_id) is not note or item["cacheId"] == note_id:
            return
        holder = self.live.get(note_id)
        if holder is not None and holder is not item:
            self.set_cache_id(holder, self.fresh())
        self.set_cache_id(item, note_id)


def in_order(notes):
    for note in notes:
        yield note
        yield from in_order(note.get("children", []))


def _content(note):
    """What a note says: its kind, name and text, not its marker, checkbox or ID."""
    if note["kind"] == "body":
        return json.dumps(["body", note["source"]])
    return json.dumps(["outline", note["name"], [_run(run) for run in note["runs"]]])


def _run(run):
    kind = run["kind"]
    if kind == "text":
        return ["text", run["text"], sorted(run["marks"])]
    if kind == "link":
        return ["link", run["href"], [_run(inner) for inner in run["runs"]]]
    if kind == "date":
        return ["date", run["date"]]
    return ["verbatim", run["text"]]
