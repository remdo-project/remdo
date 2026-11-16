---
title: Connect an AI assistant
description: Let ChatGPT, Claude, Perplexity, Gemini and Grok work with your RemDo documents.
---

<!-- markdownlint-disable relative-links -->

Let your AI assistant read and edit your RemDo outlines, for example to save a
conversation as notes. Pick your assistant:

<div class="assistant-tabs" markdown="1">

<section class="assistant-guide" data-assistant="chatgpt" markdown="1">

## ChatGPT

1. In ChatGPT, open **Plugins**, click **+**, then choose **Add custom MCP server**.
2. Name it **RemDo** and enter this server URL under **Connection**:

        https://remdo.com/mcp

3. Choose **OAuth**, review the warning, then select **Create as a plugin**.
   Install it, sign in to RemDo and allow access.
4. Start a new chat, type **@**, and select **RemDo**.

<div class="assistant-terminal" markdown="1">

### Use Codex instead

<div class="assistant-terminal-command" markdown="1">

In a terminal with Codex installed, run:

    codex mcp add remdo --url https://remdo.com/mcp

</div>
</div>

For account and workspace requirements, see OpenAI’s [MCP connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

</section>

<section class="assistant-guide" data-assistant="claude" markdown="1">

## Claude

1. In Claude, open **Customize → Connectors**, choose **+ Add**, then
   **Add custom connector**.
2. Name it **RemDo**, enter this server URL, then choose **Continue**:

        https://remdo.com/mcp

3. Review the authentication settings and continue. Choose **Sign in now** and
   **Use Claude’s published identity (Recommended)**, then **Add**. Sign in to
   RemDo and allow access.
4. In a chat, open **+ → Connectors** and turn on **RemDo**.

<div class="assistant-terminal" markdown="1">

### Use Claude Code instead

<div class="assistant-terminal-command" markdown="1">

In a terminal with Claude Code installed, run:

    claude mcp add --transport http remdo https://remdo.com/mcp

</div>
</div>

On Team and Enterprise plans, an Owner or Enterprise member with
connector-management permission adds RemDo first:
[add RemDo as an Owner](https://claude.ai/admin-settings/connectors?modal=add-custom-connector&connectorName=RemDo&connectorUrl=https%3A%2F%2Fremdo.com%2Fmcp),
or see Anthropic’s
[custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

</section>

<section class="assistant-guide" data-assistant="perplexity" markdown="1">

## Perplexity

1. In Perplexity, open **Plugins → Add custom → Add MCP connector**, then choose
   **Remote**.
2. Enter **RemDo** as the name and paste this **MCP server URL**:

        https://remdo.com/mcp

3. Under **Advanced**, select **OAuth** and **Streamable HTTP**. Keep network
   access **Public**, review the acknowledgement, then select **Add**.
4. Open the **RemDo** connector card and follow the sign-in prompts. Once
   connected, ask Perplexity to use RemDo in a new conversation.

Requires Pro, Max or Enterprise. On Enterprise, an administrator must allow
custom connectors or add RemDo for the organization. See Perplexity’s
[remote connector guide](https://www.perplexity.ai/help-center/en/articles/13915507-adding-custom-remote-connectors).

</section>

<section class="assistant-guide" data-assistant="gemini" markdown="1">

## Gemini

1. In Gemini on the web, open **Settings → Connected Apps**. If needed, open
   **Personal Intelligence → Connected Apps**.
2. Under **Custom apps**, paste this URL into
   **Add a custom app link to get started**. If you already have an app, choose
   **Add a custom app** first:

        https://remdo.com/mcp

3. Select **Next** and follow the connection prompts.
4. Once connected, start a chat, type **@**, and select **RemDo**.

Custom apps require a personal Google Account, age 18+, US availability, English
and **Keep Activity** turned on. See Google’s
[custom app guide](https://support.google.com/gemini/answer/17209137).

</section>

<section class="assistant-guide" data-assistant="grok" markdown="1">

## Grok

1. In Grok, open **Connectors**, click **New Connector**, then select **Custom**.
2. Paste this MCP server URL:

        https://remdo.com/mcp

3. Follow the authentication prompts, sign in to RemDo and allow access.
4. Start a new conversation and ask Grok to use your RemDo notes.

On Business and Enterprise plans, a team admin adds RemDo in the cloud console
before members connect their accounts. See the
[team connector guide](https://docs.x.ai/grok/connector-management) or Grok’s
[connector guide](https://docs.x.ai/grok/connectors).

</section>

</div>

<script src="/site-assets/assistant-tabs.js" defer></script>

## Disconnect

Review and revoke assistant access on your [Connected apps](/accounts/connected-apps/) page.
