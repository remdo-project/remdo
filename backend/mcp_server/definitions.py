"""Public MCP tool declarations, independent of the editor transport."""

# TODO: These instructions and TOOLS serve editor documents that the text format migration
# (docs/text-format-plan.md) moves into workspaces, and they're the surface the directory reviews
# approved. When migration ends, remove TOOLS and rewrite INSTRUCTIONS for workspaces, checking the
# published plugin first. Probe: delete TOOLS, then the MCP contract tests fail only on the removed
# tools.
INSTRUCTIONS = "RemDo is an outliner: each document is a tree of single-line notes. Save content as an outline, not prose: a few short topic titles at the top level, with supporting details nested under the note they support, so each parent summarizes its children and the outline reads well when folded. Give each topic or conversation its own descriptively titled document, and read a document before adding to it or relying on it."

TOOLS = [
    {
        "name": "list_documents",
        "title": "List documents",
        "description": "List the RemDo documents the user can access, with their documentIds and URLs.",
        "inputSchema": {"type": "object", "properties": {}},
        "annotations": {
            "readOnlyHint": True,
            "destructiveHint": False,
            "openWorldHint": False,
            "title": "List documents",
        },
        "execution": {"taskSupport": "forbidden"},
        "_meta": {"securitySchemes": [{"type": "oauth2", "scopes": ["openid"]}]},
    },
    {
        "name": "create_document",
        "title": "Create document",
        "description": "Create an empty RemDo document owned by the user and return its documentId and "
        "URL. Each call creates a new document, including retries.",
        "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {"title": {"type": "string", "description": "Document title."}},
            "required": ["title"],
        },
        "annotations": {
            "readOnlyHint": False,
            "destructiveHint": False,
            "openWorldHint": False,
            "title": "Create document",
        },
        "execution": {"taskSupport": "forbidden"},
        "_meta": {"securitySchemes": [{"type": "oauth2", "scopes": ["openid"]}]},
    },
    {
        "name": "rename_document",
        "title": "Rename document",
        "description": "Change the title of a RemDo document.",
        "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
                "documentId": {"type": "string", "description": "A documentId."},
                "title": {"type": "string", "description": "The new document title."},
            },
            "required": ["documentId", "title"],
        },
        "annotations": {
            "readOnlyHint": False,
            "destructiveHint": True,
            "idempotentHint": True,
            "openWorldHint": False,
            "title": "Rename document",
        },
        "execution": {"taskSupport": "forbidden"},
        "_meta": {"securitySchemes": [{"type": "oauth2", "scopes": ["openid"]}]},
    },
    {
        "name": "read_document",
        "title": "Read document",
        "description": "Read a RemDo document, or one note and its descendants, as a nested Markdown "
        "list. Each note links to its URL, whose last path segment is the noteAddress; a "
        "note without a link cannot be addressed until the document is opened in RemDo. A "
        "note's body follows it as an indented blockquote.",
        "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
                "target": {
                    "type": "string",
                    "description": "A documentId to read the whole "
                    "document, or a noteAddress to read "
                    "that note and its descendants.",
                },
                "depth": {
                    "description": "How many levels to return, counting the "
                    "top-level notes (or the addressed note) "
                    "as level 1. A note on the last level "
                    "reports how many children it hides. "
                    "Defaults to every level.",
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 9007199254740991,
                },
            },
            "required": ["target"],
        },
        "annotations": {
            "readOnlyHint": True,
            "destructiveHint": False,
            "openWorldHint": False,
            "title": "Read document",
        },
        "execution": {"taskSupport": "forbidden"},
        "_meta": {"securitySchemes": [{"type": "oauth2", "scopes": ["openid"]}]},
    },
    {
        "name": "append_children",
        "title": "Append notes",
        "description": "Append notes as the last children of a note (by noteAddress) or as the last "
        "top-level notes of a document (by documentId). Write an outline: short topic "
        "titles at the top level, supporting details nested beneath. Each call adds new "
        "notes, including retries.",
        "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
                "parent": {"type": "string", "description": "A documentId or a noteAddress."},
                "notes": {
                    "type": "array",
                    "items": {"$ref": "#/definitions/__schema0"},
                    "description": "At most 1000 notes, counting nested children.",
                },
            },
            "required": ["parent", "notes"],
            "definitions": {
                "__schema0": {
                    "type": "object",
                    "properties": {
                        "text": {"type": "string", "description": "Plain single-line note text."},
                        "checked": {"type": "boolean"},
                        "childListType": {
                            "description": "List type of the children; defaults to the list containing this note.",
                            "type": "string",
                            "enum": ["bullet", "number", "check"],
                        },
                        "children": {"type": "array", "items": {"$ref": "#/definitions/__schema0"}},
                    },
                    "required": ["text"],
                }
            },
        },
        "annotations": {
            "readOnlyHint": False,
            "destructiveHint": False,
            "openWorldHint": False,
            "title": "Append notes",
        },
        "execution": {"taskSupport": "forbidden"},
        "_meta": {"securitySchemes": [{"type": "oauth2", "scopes": ["openid"]}]},
    },
    {
        "name": "set_child_list_type",
        "title": "Set list type",
        "description": "Convert the list holding a note's children to bullet, number, or check. Nested "
        "lists keep their own types. A note without children is refused.",
        "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
                "noteAddress": {"type": "string", "description": "A noteAddress."},
                "listType": {
                    "type": "string",
                    "enum": ["bullet", "number", "check"],
                    "description": "The list type of the note's children.",
                },
            },
            "required": ["noteAddress", "listType"],
        },
        "annotations": {
            "readOnlyHint": False,
            "destructiveHint": True,
            "idempotentHint": True,
            "openWorldHint": False,
            "title": "Set list type",
        },
        "execution": {"taskSupport": "forbidden"},
        "_meta": {"securitySchemes": [{"type": "oauth2", "scopes": ["openid"]}]},
    },
]

REF = {
    "type": "string",
    "description": "A note reference, as read_note returns it: `me` for the account root, "
    "which lists the user's workspaces, a workspace ID, or `<workspaceId>/README.md` for a "
    "workspace's document.",
}
EXPECTED = {
    "type": "object",
    "description": "The versions read_note returned, by reference, for the document this "
    "operation changes; null for a document read before it was first saved. A document "
    "changed since is refused; read it again.",
    "additionalProperties": {"type": ["string", "null"]},
}
DRY_RUN = {"type": "boolean", "description": "Describe the change, with diffs, without making it."}
REPLACEMENTS = {
    "type": "array",
    "description": "Instead of the whole value: exact replacements applied in order, each "
    "matching exactly once, whitespace included.",
    "items": {
        "type": "object",
        "properties": {"old": {"type": "string"}, "new": {"type": "string"}},
        "required": ["old", "new"],
    },
}
CONTENT_ENCODING = {
    "type": "string",
    "enum": ["utf8", "base64"],
    "description": "How content is given. Defaults to utf8.",
}


def declare_note_tool(
    name, title, description, properties, required, read_only=False, destructive=True
):
    return {
        "name": name,
        "title": title,
        "description": description,
        "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": False,
        },
        "annotations": {
            "readOnlyHint": read_only,
            "destructiveHint": destructive and not read_only,
            "openWorldHint": False,
            "title": title,
        },
        "execution": {"taskSupport": "forbidden"},
        "_meta": {"securitySchemes": [{"type": "oauth2", "scopes": ["openid"]}]},
    }


NOTE_TOOLS = [
    declare_note_tool(
        "read_note",
        "Read note",
        "Read a note: the account root (`me`, the default), which lists the "
        "workspaces, a workspace, whose one child is its Markdown document README.md, or that "
        "document. Returns its kind, text (a name), the operations it offers, its version, and "
        "its children to the given depth. A document's outline isn't listed yet; ask for its "
        "content instead. Pass the versions you read as `expected` when changing notes.",
        {
            "ref": {**REF, "description": "The note to read. Defaults to `me`."},
            "depth": {
                "type": "integer",
                "minimum": 0,
                "maximum": 100,
                "description": "How many levels of children to return. Defaults to 1; 0 "
                "returns only whether the note has children.",
            },
            "content": {
                "type": "boolean",
                "description": "Also return a document's content, as UTF-8 text or, for other "
                "bytes, base64.",
            },
        },
        [],
        read_only=True,
    ),
    declare_note_tool(
        "insert_note",
        "Insert note",
        "Create a workspace under the account root (`me`, the default parent), optionally with "
        "its document's Markdown content. Each call creates a new workspace, including retries.",
        {
            "parent": {
                **REF,
                "description": "Where to create the note. Defaults to `me`.",
            },
            "kind": {"type": "string", "enum": ["workspace"]},
            "text": {"type": "string", "description": "The workspace's name."},
            "content": {"type": "string", "description": "The workspace document's content."},
            "contentEncoding": CONTENT_ENCODING,
            "dryRun": DRY_RUN,
        },
        ["kind", "text"],
        destructive=False,
    ),
    declare_note_tool(
        "delete_note",
        "Delete note",
        "Delete a workspace with its document and history, which needs withChildren. Returns "
        "the IDs that disappear.",
        {
            "target": {**REF, "description": "The note to delete."},
            "withChildren": {
                "type": "boolean",
                "description": "Also delete the note's children.",
            },
            "expected": EXPECTED,
            "dryRun": DRY_RUN,
        },
        ["target"],
    ),
    declare_note_tool(
        "set_note_text",
        "Rename note",
        "Change a note's text: rename a workspace.",
        {
            "target": {**REF, "description": "The note to rename."},
            "text": {"type": "string", "description": "The new name."},
            "replacements": REPLACEMENTS,
            "expected": EXPECTED,
            "dryRun": DRY_RUN,
        },
        ["target"],
    ),
    declare_note_tool(
        "set_note_content",
        "Set note content",
        "Replace a workspace document's content, whole or by exact replacements. Saving a "
        "document for the first time creates it.",
        {
            "target": {**REF, "description": "The document to change."},
            "content": {"type": "string", "description": "The whole new content."},
            "contentEncoding": CONTENT_ENCODING,
            "replacements": REPLACEMENTS,
            "expected": EXPECTED,
            "dryRun": DRY_RUN,
        },
        ["target"],
    ),
]
