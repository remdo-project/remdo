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
