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

## Current PR: Django-rendered sign-in

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

## Approved decisions outside this PR

These directions were accepted during the simplification discussion. Implement
them in cohesive later slices and keep their owning specifications aligned.

### Production startup and secrets

[Configuration](specs/runtime/configuration.md#secret-bootstrap) owns the approved production secret-bootstrap target.

The Python bundle implementation and its Docker wiring are deferred together.
The current slice retains the previous Node bootstrap, per-secret
storage/overrides, and production launcher requirements. Current Django
production settings read `AUTH_SECRET` and `YSWEET_SERVER_TOKEN` from
environment inputs, while the retained Node image loads its existing two-file
bootstrap. Django settings and management commands still need the shared
bundle wired during the production slice. This is an implementation gap
against the approved target, not a reversal of the decision.

The reason for the change is one persistence/loading path and fewer
configuration combinations. Keep development/test fixture credentials
separate. Verify fresh generation, private permissions, reuse after restart,
real Y-Sweet authentication, and rejection of missing or invalid secrets over
existing data with the production runtime.

### Administrator and backend ownership

Native [administrator creation](specs/access/access-control.md#admin-role) and Node-independent [backend settings](specs/runtime/configuration.md#resolution-boundary) remain in
the current browser slice. Carry those same boundaries into production
packaging: Django owns account administration and backend commands; pnpm owns
frontend tooling. Remove the old enrollment endpoint/UI, `ADMIN_SECRET`, and
Node backend with the corresponding obsolete production wiring and tests.
Retaining their unused implementation during the split does not require
keeping the old backend operational.

### Development instance setup

Simplify per-instance development setup in a separate slice, outside this PR.
Make backend settings such as `DEBUG` easy to override for one checkout without
editing shared tracked settings. Preserve [independent working directories](specs/runtime/configuration.md#network-addressing)
and Node-independent backend commands.

Currently, development imports the base settings and overrides them, but `DEBUG`
is not read from `.env`, and shell launchers replace `DJANGO_SETTINGS_MODULE`.
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

- **Sharing and linked sources:** Django source OAuth registration, consent,
  account-token storage, refresh/relink behavior, source-authorized document
  listing/token issuance, and local sharing/grants remain unimplemented.
  Preserve the capabilities in [source linking](specs/access/source-linking.md); port the Sharing consumer and
  cross-server tests with that slice. Source/account cache isolation needs
  end-to-end verification across independently authenticated servers.
- **Document mutations and account policy:** document rename and public-signup
  policy remain unimplemented. Native administrative account management does
  not settle public signup or the home/source role split.
- **Offline and PWA behavior:** persistent offline metadata/Home inventory and
  full [offline application behavior](architecture.md#offline-application-behavior) remain incomplete. Retain offline content
  editing; verify cached document reopen, reconnect, remembered sessions,
  logout, and account isolation together before claiming parity. Existing
  logout guarantees remain with the [access owner](specs/access/access-control.md#logout) while the discussion below is
  open.
- **Production and Docker:** the image, entrypoint, launchers, health checks,
  and gateway still need the Django API and management commands. Restore the
  approved Python secret bundle in that production slice and verify
  self-hosted Docker and hosted deployment procedures. The current frontend
  requires Django, while the production image retains the Node backend, so
  this branch has no working production deployment. The
  [deployment guide](guides/production-deployment.md) describes the accepted target.
  Remove the obsolete `ADMIN_SECRET` requirements from the launchers,
  [environment example](../.env.example), and [Render blueprint](../render.yaml).
  Complete the guide's exact Docker and Render management-command invocations
  once packaging is settled, and verify secret loading, administrator creation,
  administration sign-in, and application sign-in in the deployed runtime.
  Its upgrade procedure applies to Django deployments; migration of legacy
  Node datasets is excluded. Production/Docker tests
  still contain old backend, enrollment, and projection assumptions; they do
  not establish Django production readiness.
- **Import, exports, and recovery:** retained client-side import code is not
  first-slice verification of import/export. Define and exercise coherent
  backup/restore of Django metadata, Y-Sweet content, and secrets before
  completing the migration; a database backup or readable content export alone
  is insufficient.
- **Obsolete code:** remove the unused Node backend, enrollment
  infrastructure, Yjs app-resource projections, and their remaining
  consumers/tests after replacement slices cover their responsibilities. Do
  not add compatibility adapters or legacy-data migration to preserve them.

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
3. **Source linking:** evaluate user-entered sources with dynamic OAuth
   registration against operator-configured sources, including private-home
   reachability and independent source identities. Do not reduce existing
   capability without approval. Reconsider public signup/home/source coupling
   here.
4. **App-resource API:** after Home, offline, and source requirements are
   clearer, evaluate generated records/query APIs versus note-shaped
   account/document/grant/source wrappers using real Home and Sharing
   consumers. The first slice's cache library does not settle the public SDK
   shape.
5. **Test organization:** consider explicit fixtures and native Django/Vitest
   suites for pure TypeScript, editor, backend, collaboration, and browser
   behavior. Preserve meaningful collaboration coverage; suite reorganization
   is separate from required fixture adaptation.
6. **Production supervision, exports, and recovery:** explain existing
   mechanisms, then decide maintenance-failure behavior, optional readable
   JSON/Markdown exports, and coherent recovery. The
   [production infrastructure ADR](decisions/0001-production-infrastructure.md) remains an early draft; it does not select a
   provider, external storage, multiple instances, or zero-downtime
   deployment.

## Slice selection and retirement

After the current browser flow passes its acceptance checks, inspect the
branch and these gaps before proposing one next PR with exclusions and checks.
Cross-server OAuth remains the next risky integration to validate after
resolving the source-linking discussion. Production simplifications form their
own coherent production slice.

Keep this ledger current after each slice. The [main TODO entry](todo.md#django-backend-replacement) owns the
integration workflow and final completion gate. Retire this temporary ledger
after whole-migration review and integration into `main`, moving any surviving
independent follow-up into the normal tracking record.
