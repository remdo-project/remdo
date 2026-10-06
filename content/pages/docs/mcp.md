---
title: Connect an AI assistant
description: Let Claude and other MCP clients work with your RemDo documents.
---

<!-- markdownlint-disable relative-links -->

RemDo runs an [MCP](https://modelcontextprotocol.io/) server, so assistants
that support MCP can access and edit your documents on your behalf, for example
to save a conversation as an outline. You need a RemDo account and the server
address, `https://remdo.com/mcp`.

## ChatGPT

1. In ChatGPT, open **Plugins**, click **+**, and choose **Add custom MCP
   server**.
2. Enter **RemDo** as the name and `https://remdo.com/mcp` as the server URL.
3. Review the warning, choose **Create as a plugin**, and install the plugin.
   When prompted, sign in to RemDo and allow access.
4. Start a new chat, type **@**, and select **RemDo**.

Then ask ChatGPT to, for example, “save this conversation to RemDo”. For setup
details and workspace requirements, see OpenAI’s
[MCP connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Claude

1. In Claude, open **Customize → Connectors**, click **+**, and choose
   **Add custom connector**.
2. Enter the server address and click **Add**. Leave **Advanced settings**
   empty.
3. Click **Connect**, sign in to RemDo, and allow access.
4. In a chat, click **+**, open **Connectors**, and turn on RemDo.

Then ask Claude to, for example, “save this conversation to RemDo”. For Team
and Enterprise plans, see Anthropic's
[custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## Disconnect

Review and revoke assistant access on your
[Connected apps](/accounts/connected-apps/) page.
