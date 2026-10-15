# Mobile Device Investigation

This guide owns manual and agent investigation of mobile behavior on
[TestingBot](https://testingbot.com) cloud devices, outside verification and CI.
[Running Tests](testing.md) owns verification. The stack runs in the
[Development run mode](../run-modes.md#development), and
[Local Development](local-development.md) owns its configuration.

## Choose a Target

- **iOS** is driven with Appium over W3C WebDriver at
  `https://hub.testingbot.com/wd/hub`; TestingBot offers no Playwright for iOS.
- **Android** is driven with Playwright's experimental `_android.connect()`; add
  the app port to `tb:options.localHttpPorts`. The emulator reports no coarse
  pointer, so touch-only UI such as the
  [mobile toolbar](../specs/outliner/mobile-toolbar.md) is absent.
- **Simulators** are the default and list their names and versions in
  `GET https://api.testingbot.com/v1/browsers`, filtered to `platformName: iOS`.
  They show the same iOS 26 keyboard accessory layout as physical devices.
  Session creation takes two to three minutes.
- **Physical devices** add `tb:options.realDevice: true` and list themselves in
  `GET https://api.testingbot.com/v1/devices?platform=iOS`. A device and version
  that exist only there answer 404 and name that flag. Session creation hangs on
  a busy device, and availability changes quickly: pick an entry whose
  `available` is true right before creating the session.

## Serve the App

1. Keep `TB_KEY` and `TB_SECRET` in the checkout's `.env` and load them into the
   shell that starts the tunnel with `set -a; . ./.env; set +a`.
2. Start the tunnel and wait for its "Tunnel is ready" log line:

   ```sh
   docker run -d --name tb-tunnel --network host \
     --add-host app.test:127.0.0.1 \
     -e TESTINGBOT_KEY="$TB_KEY" -e TESTINGBOT_SECRET="$TB_SECRET" \
     testingbot/tunnel:5.0 -i device-tunnel --bind-address 127.0.0.1 \
     --nobump --nocache
   ```

   `--bind-address` keeps the credentialed relay off other interfaces.
   `--nobump --nocache` let WebSockets through, including collaboration; Vite's
   own hot-reload socket still closes, so reload to see edits. Retry a
   physical-device session after a couple of minutes when a fresh tunnel is not
   reached yet.
3. [Run the stack](local-development.md#run-main-development) with
   `PORT_BASE=3000`, `PUBLIC_HOST=app.test` and a `DATA_DIR` of its own. Cloud
   devices reach only a fixed list of local ports by default, which includes
   3000. iOS cannot use `localhost`. Sign in with a development account and open
   a document from Home.
4. For a physical device, serve the production build with gzip instead of the
   Vite dev server, whose multi-megabyte bundles never finish loading there
   although a simulator loads them:
   1. Build into `dist/`, replacing it:

      ```sh
      NODE_ENV=production COLLAB_ENABLED=false \
        ./tools/env.sh --production pnpm run build
      ```

      Both values are fixed at build time. Collaboration stays off because the
      gateway below forwards HTTP only.
   2. Run only the API with `REMDO_DEV_CONTAINER=true pnpm run dev:api`, the
      variables of step 3 and `COLLAB_ENABLED=false`. That variable makes Django
      emit the built assets. Vite stays stopped because the gateway takes its
      port.
   3. Put a gzip static server on `PORT`. It serves `dist/` for the static paths
      of the production [Caddyfile](../../docker/Caddyfile), forwards every other
      request to Django on `PORT_BASE+11` with the `Host` header unchanged, and
      binds `127.0.0.1`. Restart it after a rebuild if it caches files.

## Drive the Page on iOS

- Create a Safari session under XCUITest, choosing `appium:deviceName` and
  `appium:platformVersion` from the lists above. `tb:options` carries `key`,
  `secret`, a `tunnelIdentifier` equal to the tunnel's `-i` value, and
  `realDevice: true` for physical devices.
- Sign in from the driven page with a `fetch` POST to
  `/api/auth/browser/v1/auth/login`, taking the CSRF token from `/api/config`,
  then open the document at `/n/<id>`.
- A simulator autofocuses the editor on load, so the keyboard is already up; tap
  its `Done` first to observe a tap raising it. A physical device starts without
  the keyboard.
- A web-context click misses once the visual viewport is panned. Switch to the
  `NATIVE_APP` context and tap by accessibility label with
  `-ios predicate string`; a note's label is its text, an empty document has none
  so tap the editor by its `Outline` label, and the keyboard's `Done` works the
  same way.
- `execute/async` fails in Safari. Start work in `execute/sync`, store the
  result on `window`, and poll it.
- `GET /session/:id/appium/device/is_keyboard_shown` reports the keyboard. Native
  element rects (`/element/:id/rect`) measure system controls the page cannot
  see, and `GET /session/:id/screenshot` captures the whole device.

## Spend Sessions Deliberately

TestingBot bills session time and the trial allows one mobile session at a time.
Run the whole scenario in one session and delete it afterwards with `DELETE` on
`https://hub.testingbot.com/wd/hub/session/<id>`. A killed script leaves the
session running; stop it with
`PUT https://api.testingbot.com/v1/tests/<id>/stop`. Set a client timeout of at
least five minutes for session creation. Stop the tunnel with
`docker rm -f tb-tunnel` when done and keep credentials out of logs.

## References

- [TestingBot mobile web testing](https://testingbot.com/support/web-automate/mobile)
- [TestingBot mobile options](https://testingbot.com/support/mobile/options.html)
- [TestingBot Tunnel](https://testingbot.com/support/mobile/tunnel)
