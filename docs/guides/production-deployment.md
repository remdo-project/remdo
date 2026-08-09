# Production Deployment

This guide owns the supported deployment and first-access procedures for the
[Production run mode](../run-modes.md#production): self-hosted Docker and Render. The
[configuration specification](../specs/runtime/configuration.md) owns runtime inputs and secret bootstrap;
Architecture owns the [gateway](../architecture.md#gateway) and [persistent storage root](../architecture.md#runtime-persistence-boundary).

## Generate the Admin Secret

Generate a unique random `ADMIN_SECRET` using the guidance in the
[environment example](../../.env.example).

## Deploy with Self-Hosted Docker

This procedure requires a running Docker daemon; rootless and rootful production
daemons are supported.

1. Copy [`.env.example`](../../.env.example) to `.env`.
2. Set `ADMIN_SECRET` and set `DATA_DIR` to the instance's persistent host directory.
3. Configure direct HTTPS exposure:
   - Omit `APP_PUBLIC_URL` when the detected hostname is correct and reachable.
     The launcher derives the canonical URL from that hostname and `PORT`.
   - Otherwise, set `APP_PUBLIC_URL` to the exact direct HTTPS origin and set
     `PORT` to that origin's effective port.
   - With rootless Docker, use port 1024 or higher unless the host allows the
     daemon to publish lower ports.
4. Run the [production Docker launcher](../../tools/prod/docker.sh):

   ```sh
   ./tools/prod/docker.sh
   ```

5. Open the printed `Docker target`. The browser must trust or explicitly
   accept the container gateway's internal certificate.
6. Keep the launcher running while using RemDo. Stopping it removes the
   container and retains `DATA_DIR`.

## Deploy on Render

1. Create a Render Blueprint deployment from [the repository blueprint](../../render.yaml).
2. In the Render Dashboard, set `ADMIN_SECRET` and set `APP_PUBLIC_URL` to the
   service's exact public origin.
3. Keep the blueprint's persistent disk mounted at `/data` and its
   `ALLOW_SIGNUP=false` setting. Render supplies the container `PORT` and
   terminates public HTTPS.
4. Deploy the service and open its `APP_PUBLIC_URL`.

## Verify and Complete First Access

1. Append `/health` to the application URL and confirm that the gateway reports
   a healthy service.
2. Append `/admin` to the application URL and open it.
3. Enter `ADMIN_SECRET` and the new administrator's name, email, and password to
   complete [admin enrollment](../specs/access/access-control.md#admin-role).
4. Open the application home with the enrolled administrator account.
