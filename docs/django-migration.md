# Django Migration

This temporary, informative ledger records implementation slices and remaining
merge checks for the [Django backend replacement](todo.md#django-backend-replacement). That entry owns the completion
milestone; independent follow-up lives in the normal backlog. Existing
specifications remain the behavior owners. The slice sections describe their
original scope, not additional requirements for closing the integration.

## Browser document flow foundation

`feat/django-document-flow` targets `feat/django-backend`. An operator creates
an account with Django; the account signs in through the existing frontend,
creates or opens a document, edits collaboratively, and reopens persisted
content. Another account cannot access that document.

The `accounts` app owns the user model, account administration, and allauth
adapters; `documents` references the configured user model. Their initial
migrations target a fresh database. Use a fresh `DATA_DIR` for development
databases created before this split; no legacy-data migration is provided.

Retain:

- Django/allauth sessions, models and migrations, native administration, and
  DRF document and Y-Sweet token APIs under [access control](specs/access/access-control.md) and the
  [document registry](architecture.md#document-registry).
- Generated API clients, account-scoped TanStack Query metadata reads and
  creation, and the existing editor/Yjs/Y-Sweet integration. Restoring
  projections or handwritten API declarations would add responsibilities to
  this slice.
- Native Django settings, Node-independent backend commands, and shared shell
  address resolution needed for [isolated working directories](specs/runtime/configuration.md#network-addressing).
- Focused backend, cache/session, collaboration, and browser checks, with the
  fixtures and launch support needed to exercise this flow. Retain the direct
  Django adaptation of development data reset so fixtures create account
  metadata and persisted editor content together.

Exclude production packaging and secret migration, cleanup of the unused Node
backend, Home/starter-document redesign, new offline/logout policy,
source-linking decisions, app-resource API redesign, test-suite
reorganization, and backup/supervision work. Further fixture redesign is
separate; retaining the direct development reset adaptation avoids replacement
or disabled-command infrastructure.

### Acceptance checks

1. Django CLI account creation, application sign-in, and native administration
   work together.
2. Create/open/edit/reopen works through the actual browser and Y-Sweet,
   including persisted content.
3. A second client observes edits; another account cannot list the document or
   obtain its collaboration token.
4. CSRF and session boundaries work. Retiring an account metadata cache
   cancels its reads, and late responses cannot populate the next account's
   cache.
5. Backend management/check commands work without Node or frontend
   dependencies; independent working directories retain separate data, ports,
   and browser sessions.
6. Applicable backend, session/cache, collaboration, and browser tests, static
   checks, and generated-schema verification pass under the [testing policy](dev/testing.md).
   The gaps below distinguish incomplete migration suites from completed
   behavior; prior checks of the larger change do not verify the reduced
   slice.

## Django-rendered sign-in

`feat/django-account-pages` builds on the browser-flow commit `fa822b6c` and
targets `feat/django-backend` after that foundation lands. Allauth owns the
login form and credential validation. The React editor retains session checks,
offline reopening, and logout; a server-confirmed login clears the browser's
pending logout and cached account context before returning to the app.

Include native sign-in, safe return navigation, development and preview
routing, and the small browser-state handoff. Exclude signup, password
recovery, MFA, source linking, production packaging, and broader UI or
developer-tooling redesign.

Acceptance checks cover invalid credentials, return to Home or a requested
document, an existing admin session, logout followed by another account's
login, offline cached-document reopening, and preview sign-in. Run focused
backend/session/browser checks and generated-schema verification.

## Django production runtime

`feat/django-production-runtime` builds on the sign-in commit `9334642d` and
targets `feat/django-backend` after its prerequisites land. Deploy the existing
account/document flow through Caddy, Gunicorn/Django, and native Y-Sweet, with
no Node runtime in the image. Python owns the persistent secret bundle; Django
owns migrations and administrator creation.

Include self-hosted Docker and externally terminated HTTPS wiring, native
sign-in/admin/static routes, startup health and process shutdown, and
data/secret persistence across restart. Verify generated secrets with the real
collaboration server, CSRF behind the gateway, private bundle permissions, and
refusal to replace missing/corrupt secrets over existing data. The container
verification suite covers this implemented slice; retained
source-linking/offline suites need separate migration.

Exclude sharing/source linking, backup/restore redesign, Home policy, and
general unused-code cleanup. Backup and export follow-up is tracked under
[Operations](todo.md#operations). The existing [upgrade rollback procedure](guides/production-deployment.md#upgrade-an-existing-instance) remains separate from that
work.

## Retire the Node API runtime and enrollment

`refactor/retire-node-api-runtime` builds on the merged production runtime and
targets `feat/django-backend`. Remove the unused Node HTTP launcher, runtime
lifecycle, secret-based admin enrollment route, and their exclusive tests and
dependencies. Django owns service startup and administrator creation.

The old in-process server and its auth/document helpers remain reference code
under the [post-migration redesign exception](todo.md#cross-server-linking-redesign). Retained tests create accounts
through their auth helper rather than the removed enrollment route. Snapshot
tooling and the Y-Sweet helper used by headless consumers stay
with their pending replacement slices.

Acceptance checks cover retained server tests, Django account/document behavior,
the browser document journey, type checking, and dependency/reference audits.
Exclude sharing/source-linking implementation, recovery, test-runtime redesign,
and new document features. Document rename is post-migration feature work tracked
in the [ordinary backlog](todo.md#ux-direction), not a migration completion gate.

## Local document sharing

`feat/django-document-sharing` targets `feat/django-backend`. Django owns local
document grants, lists owned and granted documents, and authorizes collaboration
tokens for either. The existing Sharing page grants access by local-account
email and displays persisted recipients through the account-scoped query cache.
Only owners can grant access; repeated grants are idempotent.

Acceptance checks cover owner-only grants, invalid and unknown emails, duplicate
submissions, CSRF, recipient listings and editing, unrelated-account denial, and
late mutation responses after account departure. Verify the real browser flow
from sharing through recipient collaboration and reopen.

Exclude cross-server source linking, grant revocation, public signup, Home policy,
rename, and broader cache/SDK redesign. Retain the current Home restriction until
the [Home and initial-document follow-up](todo.md#ux-direction) is implemented with its companion changes.

## Withdraw cross-server linking

Withdraw the linking form, consent page, OAuth login-resume path, and
advertised linking workflow. Preserve local document sharing and existing SDK,
Home, collaboration, and backend internals. Verify local sharing and normal
sign-in/navigation, with no linking or consent UI.

The [post-migration redesign](todo.md#cross-server-linking-redesign) owns both replacement design and retirement of
retained reference code. This explicit exception to migration cleanup avoids
reviewing temporary internal changes twice.

## Offline verification

The Django production suite covers cached-document reopen, persisted offline
edits and reconnect, remembered sessions, cross-tab logout, explicit completion
of pending server logout, and account isolation. It also verifies
unavailable-session recovery through Django sign-in and non-editable uncached
documents that load on reconnect.

The retained offline shell tests now use Django navigation. Duplicate document
checks and obsolete React administration expectations are retired. Offline Home
inventory remains [future work](architecture.md#future); broader improvements remain in the
[offline follow-ups](legacy-backlog.md#offline-and-local-persistence-follow-ups), outside migration completion.

## PostgreSQL adoption

Render uses managed PostgreSQL; standalone production and ordinary development
retain SQLite. Verification covers both engines, using Compose only for
disposable PostgreSQL services. No SQLite-to-PostgreSQL data transfer is provided.
Application models and migrations remain Django-owned.

## Remaining migration gaps

- **In-flight logout responses:** complete [logout supersession](specs/access/access-control.md#logout) across native
  sign-in and already-dispatched revocation. A real-browser check held Django's
  logout response, completed another account's native login, then delivered the
  old response within the logout deadline: its session-cookie deletion made the
  new browser session unauthenticated. The pre-dispatch generation guard cannot
  prevent this response effect. Resolve cookie-response ordering or coordinate
  session transitions; client result checks alone are insufficient.
- **Administration invariants:** restrict edits to existing document ownership
  and kind unless explicit transfer/conversion semantics are accepted.
  Converting a shared normal document into Home currently preserves grants and
  recipient token access; retain the existing Home rule without implementing its
  deferred redesign.
- **Production diagnostics:** configure privacy-safe Django request-error
  output. Unexpected 500 responses currently reach neither stderr nor
  administrator email. Verify useful diagnostics without arbitrary exception
  messages, request data, or other confidential content under the
  [logging principle](principles.md#data-and-trust).
- **Production client addresses:** configure allauth's trusted proxy boundary
  for the actual standalone and hosted gateway chains. Current IP-based login
  limits treat unrelated clients as loopback; development disables those limits.
  Verify distinct clients through Caddy and the hosted proxy, retaining the
  framework limiter.
- **Advertised migration leftovers:** use the bounded cleanup in [PR #608](https://github.com/remdo-project/remdo/pull/608) to
  correct README, architecture, onboarding, and deployment claims about the
  retired backend, linking, exporter, and scheduler. Remove unsupported backup
  entry points while retaining live snapshot tooling and explicitly retained
  reference code/tests. Do not implement deferred recovery here.
- **Retained test data:** restore the [Docker harness](specs/testing/test-harness.md#docker-e2e-tests) guarantee that retained
  runtime data is readable only by its invoking user; ordinary directory
  creation currently inherits the caller's umask.
- **Production and Docker:** locally verify self-hosted startup and the hosted
  HTTP hop behind TLS termination with the Django image. Actual Render
  deployment, public-certificate issuance, and rootful Docker verification
  remain external checks.
- **Production integration coverage:** restore one real supported-launcher smoke
  through its published bridge origin. After hosted container replacement,
  authenticate afresh, list the original document, obtain a new Django token,
  and read its content through the gateway; privileged Y-Sweet readback alone
  misses the metadata/authorization boundary.
- **Import/export:** retained client-side import code is not verification of
  supported user-facing import/export paths. Check those independently of the
  deferred [recovery work](todo.md#operations).
- **Obsolete code:** linking reference code is retained under the
  [redesign exception](todo.md#cross-server-linking-redesign). Retire other migration-only tooling as its replacement
  slices land.

Post-merge proposals from the same review are tracked under
[account administration](todo.md#account-administration) and [Operations](todo.md#operations). Before retiring this ledger, triage its
excluded grant-revocation and password-change topics into the normal backlog if
wanted; exclusions alone do not commit new features. Recovery and
account/document deletion remain with their existing follow-up.

## Slice selection and retirement

Review the integration branch as a whole and close the remaining merge checks
under the [completion criteria](todo.md#django-backend-replacement). Keep independent redesign and recovery work in
the normal backlog rather than extending the integration branch.

Retire this temporary ledger after whole-migration review and integration into
`main`, preserving any surviving independent follow-up in [RemDo TODO](todo.md#tracked-follow-up).
