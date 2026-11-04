"""Public MCP tool declarations, independent of the editor transport."""

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
    "type": "object",
    "properties": {
        "path": {
            "type": "string",
            "description": "The note's path in its workspace: a folder, document or file. "
            "Empty for the workspace itself.",
        }
    },
    "required": ["path"],
}

# Only users with the workspace permission see these, so other users keep the submitted surface.
WORKSPACE_TOOLS = [
    {
        "name": "list_workspaces",
        "title": "List workspaces",
        "description": "List the user's RemDo workspaces: Markdown documents and other files in "
        "folders, changed through read_note and change_workspace.",
        "inputSchema": {"type": "object", "properties": {}},
        "annotations": {
            "readOnlyHint": True,
            "destructiveHint": False,
            "openWorldHint": False,
            "title": "List workspaces",
        },
        "execution": {"taskSupport": "forbidden"},
        "_meta": {"securitySchemes": [{"type": "oauth2", "scopes": ["openid"]}]},
    },
    {
        "name": "read_note",
        "title": "Read workspace note",
        "description": "Read a workspace, folder, document or file: its kind, text (a name), the "
        "operations it offers, its version, and its children to the given depth. Folders list "
        "their children by name. A document's outline isn't listed yet; ask for its content "
        "instead. Pass the versions you read to change_workspace.",
        "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
                "workspace": {"type": "string", "description": "A workspace ID."},
                "ref": {**REF, "description": "The note to read; omit for the workspace."},
                "depth": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100,
                    "description": "How many levels of children to return. Defaults to 1; "
                    "0 returns only whether the note has children.",
                },
                "content": {
                    "type": "boolean",
                    "description": "Also return a document's or file's content, as UTF-8 text "
                    "or, for other bytes, base64.",
                },
            },
            "required": ["workspace"],
        },
        "annotations": {
            "readOnlyHint": True,
            "destructiveHint": False,
            "openWorldHint": False,
            "title": "Read workspace note",
        },
        "execution": {"taskSupport": "forbidden"},
        "_meta": {"securitySchemes": [{"type": "oauth2", "scopes": ["openid"]}]},
    },
    {
        "name": "change_workspace",
        "title": "Change workspace",
        "description": "Create, move, rename, edit or delete documents, files and folders in one "
        "workspace. Operations apply in order, all or none, and a later one can name a note an "
        "earlier one created. State the version you read of every existing document or file "
        "you change, or of a folder holding it; a note changed since is refused, so read it "
        "again. setText renames; setContent replaces a document's or file's content. Use "
        "dryRun to preview the change.",
        "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
                "workspace": {"type": "string", "description": "A workspace ID."},
                "operations": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 100,
                    "items": {
                        "type": "object",
                        "properties": {
                            "op": {
                                "type": "string",
                                "enum": ["insert", "move", "delete", "setText", "setContent"],
                            },
                            "target": {**REF, "description": "The note to change."},
                            "parent": {
                                **REF,
                                "description": "For insert and move: the workspace or folder "
                                "to put the note in; insert defaults to the workspace.",
                            },
                            "kind": {
                                "type": "string",
                                "enum": ["document", "file"],
                                "description": "For insert: a Markdown document, or another file.",
                            },
                            "text": {
                                "type": "string",
                                "description": "For insert and setText: the name. A document's "
                                "name has no .md; a file's name includes its extension.",
                            },
                            "content": {
                                "type": "string",
                                "description": "For insert and setContent: the whole content.",
                            },
                            "contentEncoding": {
                                "type": "string",
                                "enum": ["utf8", "base64"],
                                "description": "How content is given. Defaults to utf8.",
                            },
                            "replacements": {
                                "type": "array",
                                "description": "For setText and setContent, instead of text "
                                "or content: exact replacements applied in order, each "
                                "matching exactly once, whitespace included.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "old": {"type": "string"},
                                        "new": {"type": "string"},
                                    },
                                    "required": ["old", "new"],
                                },
                            },
                            "withChildren": {
                                "type": "boolean",
                                "description": "For delete: also delete the note's children. "
                                "Required for a folder or a non-empty document.",
                            },
                        },
                        "required": ["op"],
                    },
                },
                "expected": {
                    "type": "object",
                    "description": "The versions read_note returned.",
                    "properties": {
                        "files": {
                            "type": "object",
                            "description": "Document or file path to its version.",
                            "additionalProperties": {"type": "string"},
                        },
                        "folders": {
                            "type": "object",
                            "description": "Folder path to its version, covering every file "
                            "under it; empty path for the whole workspace.",
                            "additionalProperties": {"type": "string"},
                        },
                    },
                },
                "dryRun": {
                    "type": "boolean",
                    "description": "Describe the change, with diffs, without making it.",
                },
            },
            "required": ["workspace", "operations"],
        },
        "annotations": {
            "readOnlyHint": False,
            "destructiveHint": True,
            "openWorldHint": False,
            "title": "Change workspace",
        },
        "execution": {"taskSupport": "forbidden"},
        "_meta": {"securitySchemes": [{"type": "oauth2", "scopes": ["openid"]}]},
    },
]
