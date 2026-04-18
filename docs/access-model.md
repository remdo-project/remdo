# Access Model

## Purpose

Define the access cases RemDo should support.

## Shared questions

For each access case, the important questions are:

1. who is the actor
2. what grants access
3. what the actor may access
4. which run modes should support the case

## Local-only app access

- Actor: person using a local RemDo app on the same machine.
- Grant: local machine access.
- Scope: the local app and its local documents.
- Run modes: local self-hosted app, local development.

## Host-local development and test access

- Actor: developer or CI runner.
- Grant: host-local process access.
- Scope: development and test runtimes.
- Run modes: local development, unit and collab tests, browser E2E, Docker prod E2E, CI.

## Authenticated app access

- Actor: signed-in app user.
- Grant: login accepted by the target app server.
- Scope: the app and the documents exposed by that server.
- Run modes: self-hosted app server, managed cloud app server.
- Authentication methods: username/password, OAuth, or other login methods the
  target app server supports.

## Share-link access

- Actor: anyone with a valid share link.
- Grant: bearer link.
- Scope: the shared document with read/write access.
- Login: this case should work without user login.
- Recipient scope: the recipient may be a different user from the one who
  created the link.
- Run modes: self-hosted app server, managed cloud app server.

## Cross-server authenticated document access

- Actor: signed-in user using a RemDo client that can access more than one
  server.
- Grant: authenticated document access bound to a remote identity or auth
  reference on another server.
- Scope: remote documents hosted on another RemDo server and shown in the
  client alongside local documents.
- Run modes: self-hosted app server, managed cloud app server.
- Client shape: one client may use documents from more than one RemDo server at
  the same time.
- Account scope: this may cover one person's accounts on different servers or
  one person sharing with another person on a different server.

