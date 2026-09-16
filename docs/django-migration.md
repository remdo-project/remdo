# Django Migration

This temporary, informative ledger preserves the current slice, deferred
decisions, and remaining gaps for the [Django backend replacement](todo.md#django-backend-replacement). Existing
specifications remain the behavior owners. An approved direction does not make
its implementation part of the current PR; proposed alternatives remain open
until selected.

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
general unused-code cleanup. The old scheduled exporter reads the Node database
and is not installed or started in this image. Automatic exports and the
backup-scheduler part of the production failure-domain contract remain gaps
until the recovery slice supplies their Django replacement. A stopped-instance
copy of the complete data root remains the upgrade rollback procedure.

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
the [Home privacy decision](#home-privacy) is implemented with its companion changes.

## Current PR: withdraw cross-server linking

Withdraw the linking form, consent page, OAuth login-resume path, and
advertised linking workflow. Preserve local document sharing and existing SDK,
Home, collaboration, and backend internals. Verify local sharing and normal
sign-in/navigation, with no linking or consent UI.

The [post-migration redesign](todo.md#cross-server-linking-redesign) owns both replacement design and retirement of
retained reference code. This explicit exception to migration cleanup avoids
reviewing temporary internal changes twice.

## Approved decisions outside this PR

These directions were accepted during the simplification discussion. Implement
them in cohesive later slices and keep their owning specifications aligned.

### Development instance setup

Simplify per-instance development setup in a separate slice, outside this PR.
Make backend settings such as `DEBUG` easy to override for one checkout without
editing shared tracked settings. Preserve [independent working directories](specs/runtime/configuration.md#network-addressing)
and Node-independent backend commands.

Currently, development imports shared base settings and overrides them, but `DEBUG`
is not read from `.env`. Non-production shell launchers preserve an explicit
`DJANGO_SETTINGS_MODULE` so test settings reach fixture commands and
services.
Evaluate native Django settings-module selection versus a small set of explicit
environment overrides; the mechanism remains open. Keep precedence clear and
production defaults unchanged, and update the [configuration owner](specs/runtime/configuration.md#resolution-boundary)
and [setup guide](guides/local-development.md) with the chosen approach.

### Developer workflow simplification

Alongside per-instance settings, revisit the machinery behind the
[local development guide](guides/local-development.md) in a later slice. Its length is a signal to investigate,
not proof of complexity: it also covers optional workflows and temporary
migration limitations. The goal is fewer developer responsibilities, with a
shorter guide as a consequence.

Assess dependency setup, first-account creation, launch commands, fixture reset,
API generation, and preview startup together. Reduce avoidable configuration
choices, launcher layers, and manual sequencing; prefer established tools over
adding a custom orchestration framework. Judge proposals by the steps and
decisions needed to start a fresh checkout, run a second independent instance,
and edit or reset data, while preserving backend ownership and supported
workflows. Rewording the guide or hiding the same complexity behind more
wrappers is not sufficient. This work is outside the current PR.

### Home privacy

The user rejected a special privacy restriction for Home documents. Removing
that exception from the model, sharing behavior, and [access owner](specs/access/access-control.md#document-access) is deferred
until the starter-document choice below is settled. The retained slice still
has the current special Home model; an empty workspace or an ordinary starter
document has not been selected.

## Remaining migration gaps

- **Offline and PWA behavior:** persistent offline metadata/Home inventory and
  full [offline application behavior](architecture.md#offline-application-behavior) remain incomplete. Retain offline content
  editing; verify cached document reopen, reconnect, remembered sessions,
  logout, and account isolation together before claiming parity. Existing
  logout guarantees remain with the [access owner](specs/access/access-control.md#logout) while the discussion below is
  open.
- **Production and Docker:** locally verify self-hosted startup and the hosted
  HTTP hop behind TLS termination with the Django image. Actual Render
  deployment, public-certificate issuance, and rootful Docker verification
  remain external checks. Full offline Docker scenarios still
  contain old backend/projection assumptions and are outside the current
  production test selection.
- **Import, exports, and recovery:** retained client-side import code is not
  first-slice verification of import/export. Define and exercise coherent
  backup/restore of Django metadata, Y-Sweet content, and secrets before
  completing the migration; a database backup or readable content export alone
  is insufficient. The old scheduled exporter and cron are absent from the
  Django image; restore automated exports and scheduler supervision in the
  recovery slice.
- **Obsolete code:** linking reference code is retained under the
  [redesign exception](todo.md#cross-server-linking-redesign). Retire other migration-only tooling as its replacement
  slices land.

## Open questions and dependencies

Discuss these independently; the alternatives are proposals, not instructions
to implement every item.

1. **Home and initial documents:** choose an empty workspace or one ordinary
   starter document. Resolve the document kind, account bootstrap,
   listing/cache shape, and Home consumer together. Special Home privacy is
   already rejected.
2. **Offline operations and logout:** offline content editing stays. Decide
   whether metadata mutations require connectivity and whether to revise any
   existing logout guarantees; explain unsynchronized edits, local cache
   clearing, cross-tab behavior, and server revocation before selecting
   changes. The proposed local logout/deferred revocation model was not
   separately approved by this discussion.
3. **App-resource API:** after Home, offline, and source requirements are
   clearer, evaluate generated records/query APIs versus note-shaped
   account/document/grant/source wrappers using real Home and Sharing
   consumers. The first slice's cache library does not settle the public SDK
   shape.
4. **Test organization:** consider explicit fixtures and native Django/Vitest
   suites for pure TypeScript, editor, backend, collaboration, and browser
   behavior. Preserve meaningful collaboration coverage; suite reorganization
   is separate from required fixture adaptation.
5. **Production supervision, exports, and recovery:** explain existing
   mechanisms, then decide maintenance-failure behavior, optional readable
   JSON/Markdown exports, and coherent recovery. The
   [production infrastructure ADR](decisions/0001-production-infrastructure.md) remains an early draft; it does not select a
   provider, external storage, multiple instances, or zero-downtime
   deployment.

## Slice selection and retirement

After the current browser flow passes its acceptance checks, inspect the
branch and these gaps before proposing one next PR with exclusions and checks.
Cross-server linking and its internal cleanup are deferred to the
post-migration redesign. Recovery and offline verification remain migration
completion slices.

Keep this ledger current after each slice. The [main TODO entry](todo.md#django-backend-replacement) owns the
integration workflow and final completion gate. Retire this temporary ledger
after whole-migration review and integration into `main`, moving any surviving
independent follow-up into the normal tracking record.
