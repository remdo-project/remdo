# OpenAI plugin

RemDo's OpenAI plugin distributes the hosted [MCP connection](mcp.md) for ChatGPT
and Codex using portable Agent Plugins manifests with OpenAI listing metadata.

The upload ZIP is self-contained, uses the shared application icon, and excludes
development tooling and tests. Missing assets leave the previous ZIP intact.
Unchanged sources produce byte-identical ZIPs.

## Review walkthrough

On the [development instance](../../guides/local-development.md#run-main-development), the [walkthrough](../demo/demo-video.md) demonstrates the
[manifest's review cases](../../../plugins/openai/plugin.json) through live OpenAI client interaction beside RemDo, showing
persisted results.
Negative cases leave documents unchanged; unrelated requests call no RemDo tools.

The recording identifies the client, account and connection state without
exposing credentials. CLI transcripts show readable prompts, actual replies and
compact tool activity. Client refusals are distinguished from RemDo authorization
failures.

The manifest's review URL identifies the published walkthrough.

## References

- [OpenAI: Package your plugin](https://developers.openai.com/plugins/build/plugins)
