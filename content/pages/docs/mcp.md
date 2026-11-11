---
title: Connect an AI assistant
description: Let ChatGPT, Claude, and other AI assistants work with your RemDo documents.
---

<!-- markdownlint-disable relative-links -->

Let your AI assistant read and edit your RemDo outlines, for example to save a
conversation as notes. Pick your assistant:

<div class="assistant-tabs" markdown="1">

## ChatGPT

RemDo is listed in ChatGPT’s plugin directory.

<a class="landing-button" href="https://chatgpt.com/plugins/plugin_asdk_app_6ac660fbb52c81918e101590babd0473"
target="_blank" rel="noreferrer">Open RemDo in ChatGPT</a>

1. Install the plugin. When prompted, sign in to RemDo and allow access.
2. Start a new chat, type **@**, and select **RemDo**.

Then ask ChatGPT to, for example, “save this conversation to RemDo” or
“list my RemDo documents”.

<details markdown="1">
<summary>Plugin not available in your workspace? Add RemDo as a custom server</summary>

1. In ChatGPT, open **Plugins**, click **+**, and choose **Add custom MCP
   server**.
2. Enter **RemDo** as the name and `https://remdo.com/mcp` as the server URL.
3. Review the warning, choose **Create as a plugin**, and install the plugin.
   When prompted, sign in to RemDo and allow access.
4. Start a new chat, type **@**, and select **RemDo**.

For workspace requirements, see OpenAI’s
[MCP connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

</details>

## Claude

<a class="landing-button"
href="https://claude.ai/customize/connectors?modal=add-custom-connector&amp;connectorName=RemDo&amp;connectorUrl=https%3A%2F%2Fremdo.com%2Fmcp"
target="_blank" rel="noreferrer">Add RemDo to Claude</a>

1. Claude opens **Add custom connector** with RemDo filled in. Click **Add**,
   then **Connect**, sign in to RemDo, and allow access.
2. In a chat, click **+**, open **Connectors**, and turn on RemDo.

Then ask Claude to, for example, “save this conversation to RemDo”.

<details markdown="1">
<summary>Button didn’t work, or on a Team or Enterprise plan? Add RemDo manually</summary>

1. In Claude, open **Customize → Connectors**, click **+**, and choose
   **Add custom connector**.
2. Enter `https://remdo.com/mcp` and click **Add**. Leave **Advanced settings**
   empty.
3. Click **Connect**, sign in to RemDo, and allow access.
4. In a chat, click **+**, open **Connectors**, and turn on RemDo.

On Team and Enterprise plans, an Owner adds RemDo for the organization first:
[add RemDo as an Owner](https://claude.ai/admin-settings/connectors?modal=add-custom-connector&connectorName=RemDo&connectorUrl=https%3A%2F%2Fremdo.com%2Fmcp),
or see Anthropic's
[custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

</details>

## Other agents

Most assistants that support MCP can walk you through their own setup. Ask
yours:

> How do I connect this chat to remdo.com, and what can I do with it?

<details markdown="1">
<summary>Know MCP? Server address and commands</summary>

Add a remote MCP server with this address, then sign in to RemDo when asked; no
API key is needed:

    https://remdo.com/mcp

Claude Code, then sign in from `/mcp`:

    claude mcp add --transport http remdo https://remdo.com/mcp

Codex, then sign in with `codex mcp login remdo` if not prompted:

    codex mcp add remdo --url https://remdo.com/mcp

</details>

</div>

<script src="/site-assets/assistant-tabs.js" defer></script>

## Disconnect

Review and revoke assistant access on your
[Connected apps](/accounts/connected-apps/) page.
