# Production Deployment

This guide owns the supported deployment and first-access procedures for the
[Production run mode](../run-modes.md#production): self-hosted Docker and Render. The
[configuration specification](../specs/runtime/configuration.md) owns runtime inputs and secret bootstrap;
Architecture owns the [gateway](../architecture.md#gateway) and [persistent storage root](../architecture.md#runtime-persistence-boundary).

## Generate the Admin Secret

Generate a unique random `ADMIN_SECRET` using the guidance in the [environment example](../../.env.example).

## Deploy with Self-Hosted Docker

This procedure requires a running Docker daemon; rootless and rootful production
daemons are supported.

1. Copy [`.env.example`](../../.env.example) to `.env`.

   ```sh
   cp .env.example .env
   ```

2. In `.env`, set `ADMIN_SECRET` and `DATA_DIR`, then select one self-hosted
   production exposure example.

   For access only through the Docker host, select the loopback example. Its
   gateway is reachable only through that host's loopback interface.

   For direct host exposure, select the direct HTTPS example.

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

5. Open the printed `Docker target`. Caddy uses its internal CA for `.localhost`
   and manages a publicly trusted certificate for a public DNS name. For the
   loopback deployment, trust
   `${DATA_DIR}/caddy/pki/authorities/local/root.crt` on each browser client.
6. Keep the launcher running while using RemDo. Stopping it removes the
   container and retains `DATA_DIR`.

## Deploy on Render

1. Create a Render Blueprint deployment from [the repository blueprint](../../render.yaml).
2. In the Render Dashboard, set `ADMIN_SECRET` and set `APP_ORIGIN` to the
   service's exact public origin.
3. Keep the blueprint's persistent disk mounted at `/data` and its
   `ALLOW_SIGNUP=false` setting. Render supplies the container `PORT` and
   terminates public HTTPS.
4. Deploy the service and open its `APP_ORIGIN`.

## Verify and Complete First Access

1. Append `/health` to the application URL and confirm that the gateway reports
   a healthy service.
2. Append `/admin` to the application URL and open it.
3. Enter `ADMIN_SECRET` and the new administrator's name, email, and password to
   complete [admin enrollment](../specs/access/access-control.md#admin-role).
4. Open the application home with the enrolled administrator account.
