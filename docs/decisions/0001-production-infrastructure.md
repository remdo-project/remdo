# ADR: Initial Production Infrastructure & Launch Architecture

- **Status:** Proposed — for human review and decision; the S3 document-storage
  direction is withdrawn. The [current persistence contract](../specs/runtime/configuration.md#persistence) retains filesystem
  storage; the analysis below is historical.
- **Date:** 2026-09-15
- **Deciders:** RemDo maintainers (human review)
- **Author of draft:** agent research + synthesis (advisory; decisions are the
  maintainers')
- **Placement:** RemDo has no prior ADR convention (docs are
  contracts-with-owners). This umbrella ADR lives at
  `docs/decisions/0001-production-infrastructure.md`; confirm the home against
  [Documentation ownership](../documentation.md#ownership), and split into
  per-decision ADRs if maintainers prefer once the deferred inputs resolve.

This ADR proposes a direction and records the tradeoff analysis. It is **not** an
implementation authorization. Several sub-decisions are deliberately left
**Open/Deferred** with options laid out for human choice. Extended comparisons
and the raw landscape research are in the appendices.

## 1. Context & problem statement

RemDo is a keyboard-first collaborative outliner (Lexical + Yjs). It runs today
as a **single Docker container** deployed via a **Render Blueprint**: a Caddy
gateway fronting a Node API (Better Auth + a SQLite document registry) and a
**Y-Sweet** (Rust, Yjs CRDT) realtime collaboration server that persists document
state to a **local disk**. One region (Frankfurt), autodeploy on every `main`
commit, a single 1 GB persistent disk at `/data`.

The maintainers want to **launch RemDo as a free, no-guarantees, multi-user
SaaS** to observe real usage from a few early customers. The application layer is
out of scope (no users yet); this ADR covers **infrastructure and delivery**
only.

## 2. End state (target)

A free, no-guarantees, multi-user SaaS that is:

- available in **one EU region** (Frankfurt/EU);
- fronted by a **deployment pipeline gated by robust tests**, with a
  **maintainer-only dev/test environment** distinct from an
  **externally-available production** endpoint;
- **DDoS-protected at the external entry point**;
- **mostly-available**, and **recoverable** from durable off-box state within a
  reasonable window;
- able to **scale with demand**; and
- eventually able to **deploy with zero perceptible downtime** for connected
  editing sessions.

## 3. Decision drivers

1. **Low complexity + no architectural dead-ends** — the primary driver. Cost and
   human time are **not** constraints (engineering effort is effectively free;
   ongoing operational/pager burden is the cost that matters).
2. **Zero-downtime deploys are an eventual hard requirement** — the open question
   is *at which milestone* they land and *at what complexity cost*, not
   *whether*.
3. **Recoverability** — data must be restorable within a reasonable window; not
   every write needs consistent backup (use-case-dependent, to be refined).
4. **EU data residency** — satisfied by hosting data in an EU region; **US-owned
   vendors are acceptable** (jurisdiction/sovereignty is not a current
   requirement).
5. **Reversibility** — prefer choices that keep future options open over ones
   that optimize any single axis now.

## 4. Central finding (the reframe that shapes every decision)

Every hard blocker to scaling and zero-downtime traces to **one root cause:
critical state lives on a single local disk** — the Y-Sweet collaboration
documents, the SQLite registry + auth database, the bootstrapped secrets, and the
backups. Three consequences follow, and they de-risk the whole decision:

1. **The "disk → single instance → no zero-downtime" trap is universal across
   managed PaaS.** Render, Railway, Fly.io, Koyeb, Northflank, and Platform.sh all
   cap a service at one instance and disable zero-downtime deploys the moment a
   block disk is attached (to prevent concurrent writers). On Render this is
   documented platform behavior, not a config knob. **Therefore externalizing
   state is a prerequisite regardless of platform — it is not a platform
   choice.**
2. **DDoS protection is a fully decoupled front-layer decision.** "Put Cloudflare
   (or an equivalent) in front of any origin" is the standard, sufficient answer
   independent of where compute runs.
3. **Therefore the compute-platform decision is low-stakes and reversible** (the
   Docker image is portable), and **the incumbent (Render) can plausibly reach
   all milestones with no migration** once state is off the disk. The disk is the
   dead-end, not the platform.

This is why the recommended architecture is **staged**: launch on the incumbent,
remove the dead-end by externalizing state, and defer the genuinely complex
multi-instance coordination until a real usage signal justifies it.

## 5. Decision

### D1 — Adopt a three-stage (milestone) architecture — Recommended

Stage the work so the harder properties (zero-downtime, horizontal scale) land as
milestones with explicit trigger conditions rather than being built upfront.

- **Stage A — "Launchable":** externally-available prod endpoint (one EU
  region) and a maintainer-only dev/test environment; a test-gated pipeline with
  manual promotion to prod; DDoS at the edge; off-box backups; observability.
  Single instance; a brief reconnect blip on deploy is an accepted, documented
  limitation.
- **Stage B — "No dead-end":** move all critical state off the local disk (collab
  store, metadata DB, sessions, secrets). Still single active instance, but now
  *able* to go multi-instance.
- **Stage C — "Scales + zero-downtime":** N instances behind the balancer with
  per-document affinity routing + ownership leases + graceful drain;
  **zero-downtime deploys land here.** Triggered by a real usage signal (~70–80%
  resource utilization) or a hard zero-downtime need — not before.

**Answer to "which milestone does zero-downtime land, at what cost":** Stage C.
Its cost is the doc-affinity routing + lease + graceful-drain work; Stage B
is its cheap prerequisite.

**Rationale:** matches the low-complexity / no-dead-end driver and the industry
"start simple, evolve — but externalize state early" consensus (Appendix C).
**Alternatives not chosen:** build full multi-instance now (rejected — premature,
high complexity before any user); launch on the current setup with no
state-externalization roadmap (rejected — bakes in the dead-end).

### D2 — EU residency: EU-region data is sufficient; US vendors OK — Agreed

**Rationale:** the common posture for bootstrapped EU SaaS; keeps the
low-complexity path (Render + Cloudflare) open. Accepts US CLOUD Act /
FISA exposure. **Alternative not chosen:** strict EU-jurisdiction/sovereignty
(would rule out Render, Cloudflare, Azure, Google even in Frankfurt and force
EU-owned providers — Scaleway, Clever Cloud, OVH, Gcore/bunny.net). Held as the
documented pivot if this requirement ever hardens.

### D3 — Compute host: stay on Render for launch — Recommended

**Rationale:** zero migration to launch; native zero-config DDoS (Render runs on
Cloudflare's network), mature preview environments, Frankfurt region, plain Docker
portability. Per the central finding, Render can also serve Stages B and C once
state is externalized. **Exit cost is low and stays low** (analysis below), which
is what makes "stay for now" safe rather than a lock-in.

**Exit-cost analysis (why staying is reversible):** the app makes no
Render-proprietary API calls; `render.yaml` is ~30 lines and its equivalent on
another host is a small config rewrite, not a code change. Once state is
externalized (Stage B), compute is portable — a move is "point a new host at
the same database + bucket, cut the origin over behind Cloudflare (invisible to
users)." The bounded real costs of a future move: re-authoring deploy config +
CI, a standard `pg_dump`/logical-replication DB migration *if* the DB is
Render-managed, and re-testing. The one lock-in to avoid: do not build on
Render-proprietary features (e.g. making Render Key Value the only session store).

**Alternatives not chosen** (full comparison in Appendix B): EU-sovereign clouds
(Scaleway/Clever Cloud), Northflank (best pipeline + k8s floor), Azure Container
Apps (native WS sticky sessions), Google Cloud Run, VPS + Kamal 2 (Hetzner/OVH).
**Disqualified:** AWS App Runner (closes to new customers 2026-04-30), managed
Kubernetes (unjustified pre-PMF), Heroku/Sliplane/Zeabur.

### D4 — Edge / DDoS: Cloudflare in front of the Render origin — Recommended

**Rationale:** unmetered L3/4 DDoS free on every plan, proxies any origin (so it
composes with any future host move), and satisfies the hard DDoS requirement
without coupling to the compute choice. **Known caveat to design around:**
Cloudflare Free/Pro impose a **100-second idle timeout on WebSocket connections**
→ RemDo needs a **client heartbeat (~25–30s)**, or the Business plan raises the
cap. Recommend the heartbeat (cheap, platform-independent).

**Alternatives not chosen:** Gcore (Luxembourg) / bunny.net (EU) — held as
EU-domiciled fallbacks if vendor jurisdiction ever matters; Azure Front Door
(disqualified — cannot proxy WebSockets); AWS Shield Advanced ($3k/mo flat,
over-scoped); Fastly/Akamai (enterprise sales-led, no self-serve).

### D5 — Externalize state (the core Stage-B move) — Recommended

Move all four state classes off the local disk:

- **Collab document store → S3-compatible EU object storage** (replaces
  `/data/collab`).
- **Metadata DB (registry + Better Auth) → external managed Postgres** (D6).
- **Bootstrapped secrets → environment variables** (so instances can share; the
  Y-Sweet auth pair must be identical across instances).
- **Auth sessions → the shared DB/store** (at Stage C).

**Rationale:** this is the single move that removes the dead-end and is required
on any platform. **Alternative not chosen:** keep state on disk and scale
vertically forever (rejected — forecloses Stage C and keeps durability tied to one
volume).

### D6 — Metadata DB engine = Postgres; provider = DEFERRED (Open)

**Engine — Postgres, recommended.** Both the existing **Kysely** query builder and
**Better Auth** support Postgres first-class; largest managed-provider ecosystem
with EU/Frankfurt + built-in PITR; managed PITR delivers the "external DB instead
of a home-built SQLite backup layer" outcome the maintainers asked for.
**Alternatives not chosen:** MySQL (no advantage for this workload);
networked-SQLite (Turso/libSQL, Cloudflare D1) — smallest code change, but
Better-Auth concurrency/locking is far less proven there, smaller vendors/tighter
limits, and it doesn't cleanly solve multi-writer.

**Provider — DEFERRED**, pending the current Render account/plan/pricing
arrangement (Open input #1) and the exit-cost math. Documented options: **Neon**
(standalone → lowest future exit cost, DB branching for preview/dev envs, Frankfurt
— front-runner on portability); **Render Postgres** (simplest/colocated,
private-network, but a future Render exit adds a pg migration); **Supabase**
(bundles auth/realtime/storage RemDo doesn't need).

### D7 — Deploy pipeline, environments, and promotion — Recommended

- **Environments:** a **maintainer-only dev/test** environment (restricted via
  access controls or a separate account pool; not publicly discoverable) and an
  externally-available **production** environment. Keep `ALLOW_SIGNUP=false` in
  prod for now.
- **Pipeline:** GitHub Actions runs lint + typecheck + the **robust test suite**
  on every PR; merge to the deploy branch is blocked on green.
- **Promotion:** deploy to dev for maintainer testing; **production deploy is a
  manual trigger** after dev sign-off. Full auto-promote to prod is explicitly
  **later / out of scope**.
- **Readiness gating:** wire `healthCheckPath: /health` in `render.yaml` (the
  probe exists at `src/server/routes/api.ts:31` but is not currently wired for
  deploy gating).

**Rationale:** matches the stated requirements and the industry norm (autodeploy
is safe only behind pre-merge test gates; preview/staging + rehearsed rollback;
treat irreversible migrations as one-way doors — Appendix C). **Alternative not
chosen:** keep today's autodeploy-on-every-`main`-commit with no test gate and no
separate prod (rejected — unsafe for an externally-available service).

### D8 — Backup / DR posture — Recommended (RPO/RTO to be refined)

- **Stage A (interim):** keep the current per-minute snapshot but get a copy
  **off-box** — today all backups sit on the same 1 GB disk they protect, so a
  disk loss loses the backups too.
- **Stage B onward:** durability comes from **managed-Postgres PITR + object-store
  versioning**; retire the disk-local cron. Rehearse a restore ("an untested
  backup is a hypothesis").
- **RPO/RTO:** to be set from use cases; a free-tool-reasonable target is
  RPO in minutes–low-hours, RTO same-day.

### D9 — Observability: consolidated approach; exact tool Open — Recommended

Cover all four requested capabilities (uptime + down-alert, error tracking, usage
analytics, logs/metrics) with the fewest moving parts: one consolidated tool
(**BetterStack** or **PostHog**) for uptime + errors + logs, plus **Plausible**
for EU-resident usage analytics. **Exact tool to be explored** before commitment.
**Alternatives not chosen:** a **Grafana** stack (best dashboards, but more
assembly — metrics export + log shipping + separate error + analytics tools);
platform-native-logs-only (too minimal for the four capabilities).

### D10 — Stage-C zero-downtime & scale: build in-house — Recommended

Implement per-document affinity routing + TTL ownership leases (Y-Sweet's own
single-owner "session-backend" model, Figma-inspired), graceful drain + flush on
SIGTERM, client reconnect, and rolling multi-instance deploys. **Buy checkpoint:**
re-evaluate **Jamsocket** (Y-Sweet's maker, purpose-built to eliminate exactly
this work) once its Modal-acquisition and EU/DDoS terms settle — it could remove
most of Stage C. **Alternatives not chosen:** PartyKit / Liveblocks (re-platform
away from a working Y-Sweet integration); Ably (not Yjs-native); Hocuspocus/Tiptap
(lateral self-host move, no leverage gained).

## 6. Consequences

**Positive:** launch is achievable with no platform migration; the dead-end is
removed cheaply in Stage B; zero-downtime/scale are deferred to a real trigger;
the DDoS requirement is met without constraining compute; every heavy choice stays
reversible; durability stops depending on one disk.

**Negative / accepted:** a deploy causes a brief reconnect blip until Stage C; a
client heartbeat is required to live with Cloudflare's WS idle timeout; Stage B
requires portable DB migrations and removing direct `better-sqlite3` usage; Stage
C is genuinely complex if built in-house.

**Risks:** Assumption A1 (Y-Sweet 0.9.1 object-storage support) is unverified and
load-bearing for Stage B; the Jamsocket/Modal path carries vendor-continuity +
undocumented-EU/DDoS risk; Render's per-doc sticky routing may prove insufficient
at Stage C (mitigated by our own affinity layer or a platform pivot).

## 7. Open decisions & inputs needed (for the reviewers)

1. **Current Render account/plan/pricing arrangement** — needed input; several
   specifics (sizing, whether to adopt Render Postgres, exit-cost math) depend on
   it.
2. **Managed Postgres provider** (D6) — Neon vs Render Postgres vs Supabase.
3. **Exact observability tool** (D9) — BetterStack vs PostHog (+ Plausible).
4. **Cloudflare WS idle-timeout handling** (D4) — client heartbeat vs Business
   plan.
5. **RPO/RTO targets** (D8) — to be set from use cases.

## 8. Assumptions to verify before dependent work

- **A1 (load-bearing, Stage B collab):** Y-Sweet **0.9.1** accepts an `s3://`
  store target. Upstream supports it; this repo has only ever passed a local path;
  `node_modules` was absent from the checkout, so the pinned binary's exact syntax
  is unconfirmed. → A short verification spike before committing the collab store
  to object storage. Fallbacks if false: upgrade Y-Sweet; shared network
  filesystem; or host Y-Sweet on Jamsocket.
- **A2:** Render with the disk removed and state externalized yields
  multi-instance + zero-downtime for stateless services (documented; validate
  for our exact routing at Stage C).

## 9. Verification plan

- **Stage A:** CI blocks a red PR; the dev deploy is reachable only by
  maintainers; a manual prod deploy succeeds and `/health` gates cutover;
  Cloudflare fronts the origin and absorbs a synthetic L7 flood; an uptime probe
  alerts on induced downtime; an induced error surfaces in the tracker; a WS
  editing session survives normal idle (heartbeat) and reconnects across a deploy
  with no data loss.
- **Stage B:** kill/replace the instance and confirm docs + accounts survive
  (state is off-disk); a PITR restore drill on Postgres; confirm Y-Sweet
  reads/writes the object store (closes A1).
- **Stage C:** two instances serve disjoint documents with correct affinity; a
  rolling deploy keeps an active editing session live end-to-end (zero perceptible
  downtime); lease failover on instance kill reassigns ownership without
  divergence.
- Use **live browser inspection** as primary evidence for WS/editing UI behavior
  throughout.

## Appendix A — Current-state technical review (evidence)

Verified against the repository (file:line where cited).

**Deployment (`render.yaml`):** single `web` Docker service, plan `starter`,
region `frankfurt`, repo `remdo-project/remdo`@`main`, **autodeploy on every
commit**, persistent disk `remdo-data` **1 GB** at `/data`. Env: `DATA_DIR=/data`,
`ALLOW_SIGNUP=false` pinned; `ADMIN_SECRET` + `APP_ORIGIN` operator-set
(`sync:false`); `PORT` injected by Render (terminates HTTPS); `AUTH_SECRET` +
Y-Sweet `auth_key`/`server_token` bootstrapped onto `/data` on first run. **No
`healthCheckPath`.**

**Runtime (`docker/entrypoint.sh`):** one container supervises 4 children —
**caddy** (sole public gateway), **y-sweet** (`--host 127.0.0.1 --prod
/data/collab`), **api** (`remdo-api-server.cjs`), **crond** (per-minute backup).
Any unexpected child exit tears down the whole instance (`docs/architecture.md`
"one failure domain"). Y-Sweet is flushed via SIGINT on shutdown.

**Gateway (`docker/Caddyfile`):** `/health`→`/api/health` (loopback API); `/api*`,
`/.well-known*` → API; `handle_path /share/*` → `/data/public-share`
(unauthenticated, `no-cache`); `/d*` → collab (loopback); SPA fallback for the
rest; `/doc*` deliberately unrouted. All upstreams are `127.0.0.1` — no upstream
pool, no cross-instance awareness.

Hard blockers to more than one instance / zero-downtime:

1. **Y-Sweet doc state = local filesystem dir, no shared backend.** Repo passes
   only a local path; no `s3://` anywhere. Two instances → divergent copies or
   corruption; no doc→instance affinity.
2. **Single local SQLite** (`/data/remdo.sqlite`, `better-sqlite3`, WAL) for
   registry + Better Auth. `src/server/auth/auth.ts` documents the one-connection
   SQLITE_BUSY limit with transactions **disabled** — an in-process single-writer
   design.
3. **Render disk** = single 1 GB block volume at `/data`, holding secrets, DB,
   collab, backups, share; attaches to one instance, incompatible with
   `numInstances>1`.
4. **Gateway + API + collab = one process group / one failure domain** by design.

Soft constraints: `/health` probe exists (`src/server/routes/api.ts`, gates on
Better-Auth readiness + DB migrations; not Y-Sweet) but is not wired to
`render.yaml`; secret bootstrap has no cross-process lock (first-boot race only)
and a persistence guard hard-fails if a dataset exists without its `secrets/`;
backups (`tools/snapshot/backup.ts`) are local-only, same disk; schema is
hand-rolled `CREATE TABLE`/shape-assert (not portable migrations) and
`better-sqlite3`/`.backup()` are imported directly in a few modules
(`backup.ts`, `account-issuer-backfill.ts`, `sqlite-client.ts`) — friction
(bounded) for a Postgres move, though code sits behind the `DocumentRegistry`
interface + Kysely.

**Build (`docker/Dockerfile`):** multi-stage node24-alpine builder (builds the
SPA + esbuild-bundles server tools) → alpine+caddy runner with the native
y-sweet binary symlinked.

## Appendix B — Hosting landscape survey

Four category surveys (2025–2026). The workload lens throughout: a stateful,
persistent-WebSocket, single-writer-per-document CRDT app needing EU residency,
DDoS at the edge, and a path to externalized-state → horizontal scale →
zero-downtime.

### B.1 Managed PaaS & serverless containers (~19 evaluated)

**Universal pattern:** attaching a block disk caps a service at one instance and
disables zero-downtime deploys (Render, Railway, Fly, Koyeb, Northflank,
Platform.sh). Once stateless, most give multi-instance + zero-downtime natively.

- **Render** — US co., Frankfurt is its only EU region. Native WS; zero-config
  DDoS (on Cloudflare's net); mature preview envs; the disk tradeoff above is
  documented. Incumbent.
- **Railway** — Fastly-backed DDoS; but **no sticky sessions** (WS bounces between
  replicas) and volumes/replicas mutually exclusive — worse than Render for
  single-writer WS.
- **Fly.io** — Frankfurt first-class; volumes **not replicated** and **blue-green
  explicitly unsupported with volumes**; DDoS "basic." Best Docker portability.
- **Google Cloud Run** — Frankfurt; forced-stateless; gen2 supports shared network
  FS. Gotchas: WS capped at request timeout; **Cloud Armor/DDoS needs a self-built
  LB** (not zero-config).
- **Azure Container Apps** — Frankfurt; **native WS sticky sessions** (matches
  single-writer-per-doc) + Azure Files shared mounts. Gotcha: **Azure Front Door
  can't proxy WS**.
- **DigitalOcean App Platform** — Frankfurt; no local disk (forces
  externalization); zero-downtime default; native DDoS; but no native PR-preview
  product.
- **Heroku** — Frankfurt only on Enterprise/Private Spaces; best native
  manual-promote workflow; strategically stagnant post-Salesforce.
- **Northflank** — EU regions or BYOC; native WAF/DDoS; best preview-env and
  manual-approval pipeline; k8s floor for future StatefulSet affinity.
- **Koyeb** (FR-HQ), **Porter/Qovery/Cloud66** (BYOC-on-your-cloud), **Aptible**
  (compliance-grade, premium), **Platform.sh/Upsun** (EU-HQ, best-proven preview
  envs, but zero-downtime only beta since Dec 2025 and **DDoS is a sales-gated
  add-on**), **Scaleway Serverless Containers** (EU-sovereign, no local disk →
  pair with Cellar S3), **Clever Cloud** (EU-sovereign, FS Buckets + Cellar),
  **Sliplane** (DE, simple, **no scale path → next dead-end**), **Zeabur** (Asia
  jurisdiction — EU residency risk).
- **AWS App Runner — DISQUALIFIED:** closes to new customers **2026-04-30** →
  maintenance mode (AWS steers to ECS Express Mode).

*PaaS decision-round shortlist:* Render (stay-and-fix), Northflank, Azure Container
Apps, Cloud Run.

### B.2 VPS/IaaS + self-managed deploy tooling (13 providers, 7 tools)

- **DDoS spread is wide:** OVH and Akamai/Linode include enterprise always-on
  mitigation **free**; Hetzner is basic; DO/Azure/AWS free-tier is
  L3/4 only; Vultr is opt-in; **UpCloud has a report of silently null-routing under
  attack** (fatal for persistent WS).
- **Hetzner Cloud has no literal Frankfurt DC** (Nuremberg/Falkenstein/Helsinki;
  well-peered at DE-CIX). **Exoscale** is EU-soil but Swiss-HQ.
- **Deploy tools:** **Kamal 2** (kamal-proxy: register→health-check→promote→drain)
  is the cleanest zero-downtime fit for a single-writer WS service, proven at
  37signals. **Coolify** has a documented **10–30s stop-the-world outage on
  multi-container Compose deploys** — exactly RemDo's Caddy+API+Y-Sweet shape.
  **Dokku** no growth path. **Nomad** moved to BUSL (2025), heavy — overkill today.
- *VPS decision-round combos:* Hetzner+Kamal 2 (cheapest capable; pair w/
  Cloudflare for DDoS), OVH+Kamal 2 (strongest DDoS), Akamai/Linode+Kamal 2
  (enterprise DDoS included, non-EU-HQ).
- **Tradeoff vs PaaS:** all push OS patching / HA / backups onto the team —
  counter to the low-complexity driver.

### B.3 Edge / DDoS front-layer

- **Cloudflare — the default.** Unmetered L3/4 DDoS free on all plans; proxies
  **any** origin (decouples DDoS from host). **WS caveat: Free/Pro 100s idle
  timeout** → client heartbeat or Business plan. Spectrum (Enterprise) for raw
  TCP/non-standard ports (not needed if WS rides 443). R2 pairs at $0 egress with
  an EU-jurisdiction option. US-parent (CLOUD Act) — acceptable under D2.
- **Azure Front Door — DISQUALIFIED (HTTP/HTTPS only, no WS).**
- **AWS CloudFront + Shield** — Shield Standard free (basic L3/4); **Shield
  Advanced $3k/mo flat** — over-scoped. **Google Cloud Armor** — requires sitting
  behind a GCP LB (couples to GCP).
- **EU-domiciled alternatives:** **Gcore** (Luxembourg), **bunny.net** (Bunny
  Shield, ~$9.50/mo) — hold as fallbacks if vendor jurisdiction ever matters.
  **Netlify** WS-incapable; **Vercel** edge is for Vercel-hosted apps, not an
  arbitrary-origin WS proxy.

### B.4 Managed Kubernetes — not justified pre-PMF

Surveyed GKE Autopilot, EKS Auto, AKS, DO DOKS, Scaleway Kapsule, OVH, Civo,
Linode LKE, Vultr. For a single stateful app with one writer per document, k8s
adds control-plane/YAML/StatefulSet complexity and still leaves DDoS as a bolt-on,
for zero present benefit. Signals that would flip it: many heterogeneous services
with independent scaling, real multi-tenant shard density, an existing
k8s-operating SRE function, or a contractual multi-cloud/on-prem requirement —
none apply today.

### B.5 Specialist managed backends

- **Jamsocket** (Y-Sweet's maker; acquired by **Modal**, July 2025) —
  purpose-built to host Y-Sweet session backends (affinity/lease/persistence) with
  **BYO S3**. Could eliminate most of Stage C. Risks: mid-migration into an
  AI/GPU-focused company; **EU + DDoS terms undocumented** → re-evaluate in
  6–12 months, don't commit engineering to it yet.
- **PartyKit** (Cloudflare/DO-based), **Liveblocks** (managed Yjs, US-centric),
  **Ably** (not Yjs-native), **Hocuspocus/Tiptap** (self-host Yjs, lateral to
  Y-Sweet) — none a net simplification for a working Y-Sweet integration.
- **Managed Postgres (EU+PITR):** Neon (Frankfurt, generous PITR, branching),
  Supabase (Frankfurt, PITR add-on), Render Postgres (Frankfurt, PITR paid tier),
  Scaleway/Aiven/Crunchy Bridge.
- **Object storage (EU):** Cloudflare R2 ($0 egress, EU jurisdiction), Backblaze
  B2 (Amsterdam), Scaleway/OVH (EU-sovereign), MinIO (self-host — premature).

## Appendix C — State-externalization & zero-downtime research

- **To go multi-instance + rolling deploy, externalize:** (1) document persistence
  off local disk to shared/object storage; (2) a doc-affinity routing layer
  (consistent-hash `docId` → owning instance); (3) ownership leases (TTL claim;
  exactly one live owner, safe failover); (4) auth sessions to a shared store; (5)
  a graceful drain/flush-on-SIGTERM protocol with client reconnect.
- **Y-Sweet already implements the single-owner "session backend" + lease model**
  (Figma-inspired, S3-backed) — wanting multi-instance later follows the tool's
  intended design, not against it. Public docs are thin on rolling-deploy handoff
  timing (ask Jamsocket if precise failover SLAs are ever needed).
- **Zero-downtime for a CRDT app is a design constraint on the app, not a
  platform checkbox** — a platform's "zero-downtime deploys" only covers the
  stateless half (Caddy/API).
- **Connection draining** norm: 30–60s stickiness before forced drain; do **not**
  put connection-count into the readiness probe (it's a load signal, not a
  health signal).
- **Backup/DR norm:** set RPO/RTO first, then mechanism. Managed Postgres gives
  PITR "for free"; Litestream streams SQLite WAL to object storage (fits <~10k
  daily users) — the alternative rejected under D8 in favor of an external DB. "An
  untested backup is a hypothesis" → rehearse restores.
- **CI/CD norm:** autodeploy-to-prod is fine *only* behind pre-merge test gates;
  per-PR/staging preview envs; rehearsed rollback; treat irreversible DB
  migrations as one-way doors.
- **"Start simple, evolve" consensus:** don't build multi-instance before a real
  signal (~70–80% utilization cited); scale vertically first; but externalize state
  early because that's what removes the dead-end. In-memory/on-disk single-process
  state is the forcing function that breaks the moment a second instance appears.

## Appendix D — Selected sources

Representative; verify before relying on
any time-sensitive claim.

- Render disks / zero-downtime:
  - render.com/docs/disks
  - render.com/articles/how-render-handles-zero-downtime-deploys
- Y-Sweet storage + session backends:
  - github.com/jamsocket/y-sweet
  - docs.jamsocket.com/y-sweet/advanced/bring-your-own-s3
  - modal.com/blog/jamsocket-is-joining-modal
- Cloudflare WS + DDoS:
  - developers.cloudflare.com/network/websockets
  - cloudflare.com/application-services/products/ddos-for-web
- AWS App Runner sunset:
  - encore.dev/articles/end-of-app-runner
  - github.com/aws/apprunner-roadmap/issues/14
- Azure Front Door WS limitation:
  - learn.microsoft.com/azure/frontdoor/front-door-overview
- Litestream: litestream.io/how-it-works
- Managed Postgres PITR / DR:
  - neon.com/docs/introduction/plans
- Observability:
  - betterstack.com
  - posthog.com
  - plausible.io/self-hosted-web-analytics
  - grafana.com/products/cloud/free-tier
- Kamal / Coolify:
  - kamal-deploy.org
- "Start simple, evolve":
  - ably.com/topic/scaling-signalr
