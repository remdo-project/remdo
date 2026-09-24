# Configuration

RemDo resolves runtime configuration across server and browser boundaries.

## Resolution boundary

Runtime consumers obtain configuration only from the resolved result. Only
explicitly projected values are available to the browser; all other values
remain server-only.

Shell launchers resolve shared deployment addresses and paths. Django reads
environment variables and owns backend settings and validation; backend commands
do not require Node or frontend dependencies. Frontend tooling owns browser build
configuration.

Development launchers default to development settings; backend, collaboration,
and browser E2E test launchers select test settings. Production launchers
and direct Django invocation select production settings.
Selection uses Django's native `DJANGO_SETTINGS_MODULE`. `NODE_ENV` selects
JavaScript behavior independently and does not select backend settings.

Missing or invalid configuration fails at the boundary that requires it.
Server-only requirements do not apply to browser configuration or production utilities.

## Network addressing

- `APP_ORIGIN` is the server's canonical browser-visible origin.
  Development derives it as `http://<PUBLIC_HOST>:<PORT>`. The self-hosted
  production launcher defaults it to `https://remdo.localhost:8443` for
  loopback-only access; direct self-hosted exposure and externally hosted
  production require an explicit exact HTTPS origin. The self-hosted launcher
  also accepts an exact `http://*.localhost:<port>` origin only with
  `HOST=127.0.0.1` and a rootless Docker Engine 28 or newer, keeping HTTP
  confined to loopback. The application server also accepts the development
  container's derived HTTP origin. For self-hosted Docker, its effective port
  selects the host-side published
  [gateway](../../architecture.md#gateway) port; ports reserved for
  container-internal services are rejected.
  [Routing and origin](../../architecture.md#routing-and-origin-boundary) owns its collaboration use;
  [access control](../access/access-control.md#csrf-protection) owns its authentication use.
- `HOST` selects the gateway bind address in development. For self-hosted
  Docker, it selects only the host-side publish address and defaults to
  `127.0.0.1`. The self-hosted launcher accepts only that loopback address or
  `HOST=0.0.0.0`, which explicitly publishes the standard HTTPS port on every
  IPv4 interface.
- `PORT` is the gateway port derived from `PORT_BASE` in development and
  verification. In externally terminated production, the hosting platform
  supplies it as the internal gateway listen port; it may differ from the
  effective port of `APP_ORIGIN`. It is not a self-hosted Docker input.
- `PORT_BASE` selects the development or verification stack's port range.
  Shifting it shifts every derived port as one unit. It has no production role.
  Independent working directories use distinct 100-port blocks and their own
  data roots. A launcher refuses occupied service ports instead of selecting
  another instance's services or silently changing ports.
- `PUBLIC_HOST` selects the browser-visible hostname in development. It
  defaults to `HOST`; with `HOST=0.0.0.0`, it defaults to the machine hostname
  and must be set explicitly when that hostname is not browser-visible. It has
  no production role.

For self-hosted Docker, network mode and container addresses and ports are not
operator settings.

Production trusts one Caddy forwarding hop for [sign-in rate limits](../access/access-control.md#authenticated-app-access).
On Render (`RENDER=true`), it instead trusts the edge-overwritten
`CF-Connecting-IP` header; the public hosting edge and services able to reach the
gateway over Render's private network form the trusted ingress boundary. `PORT`
alone does not enable this header trust. Development and verification settings
disable allauth rate limits for shared-address fixtures; production-container
verification retains them.

## Database

Django defaults to SQLite under `DATA_DIR`, keeping standalone production and
local development self-contained. `DATABASE_URL` selects an external PostgreSQL
database.

[Verification](../testing/test-harness.md#database-isolation) owns its databases
and does not use an operator-supplied database URL.

## Persistence

`DATA_DIR` selects the
[persistent runtime data root](../../architecture.md#runtime-persistence-boundary).
Development defaults it to `data` inside the repository. The self-hosted
production launcher defaults its host directory to `data/production` inside
the repository; production containers use `/data` for that root.

Document content persists alongside metadata in the configured database in every
run mode.

## Secret bootstrap

Production resolves the application authentication secret and internal
collaboration secret as one bundle, shared by every process that needs them.
The environment supplies the whole bundle or none of it, and takes precedence
over a stored one. Empty, malformed, or unusable bundles fail without repair.

Without an environment bundle, startup generates one into a private
`secrets.json` file under the
[production persistence root](../../architecture.md#runtime-persistence-boundary).
An existing bundle is reused. When the bundle is absent, initialization refuses
to generate replacements if the persistence root contains a dataset or the
configured database contains metadata. Restore the bundle with its matching
[dataset](../../architecture.md#runtime-persistence-boundary). Development and verification use fixture credentials.

## Deployment accounts

Container production startup optionally provisions stable accounts from server-only
password variables. `REMDO_ADMIN_PASSWORD` creates the `admin` account as an
administrator; `REMDO_USER_PASSWORD` creates the `user` account as a regular
user. Missing variables create no account.

The account domain is `example.test`, because a self-hosted origin may be a bare
address that is invalid in an email. On Render (`RENDER=true`), where the platform
guarantees a real public hostname, the domain is the
[`APP_ORIGIN`](#network-addressing) host instead, pairing a per-instance address
with the per-instance generated password. Changing a service's origin therefore
provisions an account at the new domain and leaves the previous one in place.

Each deployment generates the administrator password where its operator already
reads secrets: Render's service environment, or `.env` for the self-hosted
launcher, which appends one on the first start that finds the variable unset.
Assigning the variable an empty value declines the account.

Provisioning creates only missing
accounts and never replaces an existing account's password, role, or documents.
A deleted account is provisioned again on the next startup while its variable
remains set. Retire it permanently by assigning the variable an empty value
rather than deleting it: the self-hosted launcher otherwise generates a
replacement on the next start, and the blueprint declares the Render keys, so a
deleted one returns on the next sync.
Startup removes the password variables from the environment it passes to the
long-running services; the platform's own record of them is outside its control.

## Google sign-in

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are OAuth client credentials that
enable [Google sign-in](../access/access-control.md#authenticated-app-access).
Both unset leaves it disabled and unrouted; setting only one fails at startup.
Google must allow `<APP_ORIGIN>/accounts/google/login/callback/` as a redirect
URI.

## Request diagnostics

Production Django request errors reach standard error with status, exception type,
and code locations when available. Diagnostics exclude request data, exception
messages, local variables, and source excerpts under the [logging principle](../../principles.md#data-and-trust).
