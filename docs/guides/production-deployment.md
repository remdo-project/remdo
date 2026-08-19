# Production Deployment

This guide owns the supported deployment and first-access procedures for the
[Production run mode](../run-modes.md#production): self-hosted Docker and Render. The
[configuration specification](../specs/runtime/configuration.md) owns runtime inputs and secret bootstrap;
Architecture owns the [production instance](../architecture.md#production-instance-boundary),
[gateway](../architecture.md#gateway), and [persistent storage root](../architecture.md#runtime-persistence-boundary).

## Generate the Admin Secret

Generate a unique random `ADMIN_SECRET` using the guidance in the [environment example](../../.env.example).

## Deploy with Self-Hosted Docker

This procedure requires a running Docker daemon; rootless and rootful production
daemons are supported.

1. Copy [`.env.example`](../../.env.example) to `.env`.

   ```sh
   cp .env.example .env
   ```

2. In `.env`, set `ADMIN_SECRET` and optionally override
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
4. Run the [production Docker launcher](../../tools/prod/docker.sh):

   ```sh
   ./tools/prod/docker.sh
   ```

   Rerunning the launcher builds successfully before gracefully replacing the
   container serving the same origin port.

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

1. Create a Render Blueprint deployment from [the repository blueprint](../../render.yaml).
2. In the Render Dashboard, set `ADMIN_SECRET` and set `APP_ORIGIN` to the
   service's exact public origin.
3. Keep the blueprint's persistent disk mounted at `/data` and its
   `ALLOW_SIGNUP=false` setting. Render supplies the container `PORT` and
   terminates public HTTPS.
4. Deploy the service and open its `APP_ORIGIN`.

## Upgrade an Existing Instance

An upgrade preserves accounts and documents. Schema changes apply on the first
start of the new version.

1. Stop the instance. A schema change can rewrite tables that authentication
   writes to.
2. Copy the [persistent storage root](../architecture.md#runtime-persistence-boundary),
   which is what a rollback restores. The [`backup` script](../../package.json)
   exports document content for reading and does not replace this copy.

   ```sh
   cp -a "${DATA_DIR}" "${DATA_DIR}.bak-$(date +%F)"
   ```

3. Deploy and start as for a new deployment.

## Verify and Complete First Access

1. Append `/health` to the application URL and confirm that the gateway reports
   a healthy service.
2. Append `/admin` to the application URL and open it.
3. Enter `ADMIN_SECRET` and the new administrator's name, email, and password to
   complete [admin enrollment](../specs/access/access-control.md#admin-role).
4. Open the application home with the enrolled administrator account.
