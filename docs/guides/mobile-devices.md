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
- **Physical devices** add `tb:options.realDevice: true`. A version that exists
  only on physical devices answers 404 and names that flag. Available devices
  come from `GET https://api.testingbot.com/v1/devices?platform=iOS`. Session
  creation hangs on a busy device; choose another.

## Serve the App

1. Keep `TB_KEY` and `TB_SECRET` in the checkout's `.env`.
2. Start the tunnel and wait for its "Tunnel is ready" log line:

   ```sh
   docker run -d --name tb-tunnel --network host \
     --add-host app.test:127.0.0.1 \
     -e TESTINGBOT_KEY="$TB_KEY" -e TESTINGBOT_SECRET="$TB_SECRET" \
     testingbot/tunnel:5.0 -i device-tunnel --bind-address 127.0.0.1
   ```

   `--bind-address` keeps the credentialed relay off other interfaces. Retry a
   physical-device session after a couple of minutes when a fresh tunnel is not
   reached yet.
3. Run the stack with `PORT_BASE=3000`, `PUBLIC_HOST=app.test` and
   `COLLAB_ENABLED=false`. Cloud devices reach only a fixed list of local ports
   by default, which includes 3000. iOS cannot use `localhost`. WebSockets,
   including collaboration, do not pass through the tunnel.
4. For a physical device, serve a production build with gzip instead of the
   Vite dev server, whose multi-megabyte bundles never finish loading. Build
   with `vite build --outDir` outside `dist/`, render pages through Django with
   `FRONTEND_USE_SOURCE=False` and `FRONTEND_MANIFEST` set to that build, and
   put a gzip static server on the device-reachable port.

## Drive the Page on iOS

- Create a Safari session under XCUITest, choosing `appium:deviceName` and
  `appium:platformVersion` from the devices API. `tb:options` carries `key`,
  `secret`, a `tunnelIdentifier` equal to the tunnel's `-i` value, and
  `realDevice: true` for physical devices.
- A web-context click misses once the visual viewport is panned. Switch to the
  `NATIVE_APP` context and tap by accessibility label with
  `-ios predicate string`, including the keyboard's `Done`.
- `execute/async` fails in Safari. Start work in `execute/sync`, store the
  result on `window`, and poll it.
- `GET /session/:id/appium/device/is_keyboard_shown` reports the keyboard. Native
  element rects (`/element/:id/rect`) measure system controls the page cannot
  see, and `GET /session/:id/screenshot` captures the whole device.

## Spend Sessions Deliberately

TestingBot bills session time and the trial allows one mobile session at a time.
Run the whole scenario in one session and delete it afterwards. A killed script
leaves the session running; stop it with
`PUT https://api.testingbot.com/v1/tests/<id>/stop`. Stop the tunnel when done and
keep credentials out of logs.

## References

- [TestingBot mobile web testing](https://testingbot.com/support/web-automate/mobile)
- [TestingBot mobile options](https://testingbot.com/support/mobile/options.html)
- [TestingBot Tunnel](https://testingbot.com/support/mobile/tunnel)
