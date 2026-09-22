# Production Deployment

This guide owns the supported deployment and first-access procedures for the
[Production run mode](../run-modes.md#production): self-hosted Docker and Render. The
[configuration specification](../specs/runtime/configuration.md) owns runtime inputs and secret bootstrap;
Architecture owns the [production instance](../architecture.md#production-instance-boundary),
[gateway](../architecture.md#gateway), and [persistent storage root](../architecture.md#runtime-persistence-boundary).


## Deploy with Self-Hosted Docker

This procedure requires a running Docker daemon; rootless and rootful production
daemons are supported.

1. Copy [`.env.example`](../../.env.example) to `.env`.

   ```sh
   cp .env.example .env
   ```

2. In `.env`, optionally override
   [`DATA_DIR`](../specs/runtime/configuration.md#persistence). By default, the
   gateway is available at `https://remdo.localhost:8443` only through the
   Docker host's loopback interface.

   For direct host exposure, set `APP_ORIGIN` to its exact public HTTPS origin
   and set `HOST=0.0.0.0`.

   For access through an SSH loopback tunnel without installing Caddy's local
   CA, set `APP_ORIGIN` to a dedicated origin such as
   `http://remdo-8443.localhost:8443` and keep `HOST=127.0.0.1`. This mode
   requires a rootless Docker Engine 28 or newer. Bind both ends of the SSH
   forward to `127.0.0.1`; SSH encrypts the connection between the browser and
   Docker hosts while HTTP remains confined to their loopback interfaces.

   ```sh
   ssh -N -o ExitOnForwardFailure=yes \
     -L 127.0.0.1:8443:127.0.0.1:8443 user@docker-host
   ```

3. For direct exposure, point the origin hostname's DNS A record at the host
   and allow inbound port 443. Rootless Docker requires the host to permit its
   daemon to publish that privileged port. The loopback example instead uses
   unprivileged port 8443.

   Preserve source IP addresses through Docker's published port so
   [sign-in rate limits](../specs/access/access-control.md#authenticated-app-access) can distinguish clients.
   With rootless Docker and RootlessKit 3 or newer,
   merge `"userland-proxy": false` into `~/.config/docker/daemon.json` and restart
   the daemon during a maintenance window. Follow
   [Docker's source-IP propagation instructions](https://docs.docker.com/engine/security/rootless/troubleshoot/#docker-run--p-does-not-propagate-source-ip-addresses)
   for kernel prerequisites or older RootlessKit versions. NAT and SSH tunnels
   that merge client addresses necessarily share one IP allowance.
4. Run the [production Docker launcher](../../tools/prod/docker.sh):

   ```sh
   ./tools/prod/docker.sh
   ```

   Rerunning the launcher builds successfully before gracefully replacing the
   container serving the same origin port. SQLite persists beneath `DATA_DIR`.
   To use an existing PostgreSQL database instead, configure `DATABASE_URL`
   with an address reachable from the app container.

5. Open the printed `Docker target`. For HTTPS, Caddy uses its internal CA for
   `.localhost` and manages a publicly trusted certificate for a public DNS
   name. For an HTTPS loopback deployment, trust the Caddy root certificate
   beneath the persistent data root on each browser client. At the default
   location, it is
   `data/production/caddy/pki/authorities/local/root.crt`.
6. The launcher returns after starting RemDo. Docker keeps the container
   running and restarts the complete instance after an unexpected failure. Use
   the printed commands to follow its logs or stop it explicitly; an explicit
   stop remains stopped until the launcher runs again. The persistent data root
   is retained across either operation.

## Deploy on Render

Deploy both environments from [the repository blueprint](../../render.yaml).

1. Create a Render Blueprint deployment from it.
2. In each service's **Environment** view, copy its generated
   `REMDO_ADMIN_PASSWORD` into the password manager. Staging also generates
   `REMDO_USER_PASSWORD`. Render preserves these generated values across later
   Blueprint syncs.
3. Point DNS at each service as Render's domain settings instruct and wait for
   its certificate.
4. For each service, set **Settings > Edge Caching > Cacheable file types** to
   **None**, preserving the [application freshness policy](../architecture.md#application-freshness).
5. For each service, complete
   [Verify and Complete First Access](#verify-and-complete-first-access).

Release production from Render's dashboard.

### Reset the Staging Sandbox

Staging's data is disposable, and its free database expires. Stop the
application, delete the database, and sync the blueprint to recreate it and
redeploy. Metadata and document content reset together. The reset does not
require shell access.

## Upgrade an Existing Instance

This procedure applies to existing Django deployments and preserves their
accounts and documents within the same database engine. Changing from SQLite
to PostgreSQL requires a fresh dataset; no data transfer is provided.
Schema changes apply on the first
start of the new version.

Application backup and recovery tooling is [separate follow-up](../todo.md#operations).

1. Stop the instance. A schema change can rewrite tables that authentication
   writes to.
2. Copy the [persistent storage root](../architecture.md#runtime-persistence-boundary),
   which is what a rollback restores.
   With PostgreSQL, separately preserve the matching database backup;
   copying `DATA_DIR` alone cannot restore metadata or document content.

   ```sh
   cp -a "${DATA_DIR}" "${DATA_DIR}.bak-$(date +%F)"
   ```

3. Deploy and start as for a new deployment.

## Verify and Complete First Access

1. Append `/health` to the application URL and confirm that the gateway reports
   a healthy service.
2. Establish the [administrator](../specs/access/access-control.md#admin-role).
   On Render, sign in as `admin@example.test` with the service's generated
   `REMDO_ADMIN_PASSWORD`. For the default self-hosted Docker origin, create
   the administrator manually (use the container name printed by the launcher):

   ```sh
   docker exec -it remdo-8443 python manage.py createsuperuser
   ```

   Management commands resolve the same
   [secret bundle](../specs/runtime/configuration.md#secret-bootstrap) as the server.
3. Open `/admin/` on the application origin and sign in with that account.
4. Open the application home and sign in with the same account.
