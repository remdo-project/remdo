# Demo Videos

This guide records the [demo videos](../specs/demo/demo-video.md). A recording
resets the target's `user` account, so record against a
[demo account](production-deployment.md#reset-the-demo-account) or a
development instance whose `user` data is disposable.

## Record a Scenario

Run from a development checkout:

```sh
pnpm demo:record <scenario> [origin]
```

The origin defaults to `https://remdo.com`. Supply the target's
`REMDO_USER_PASSWORD` through the environment or `.env`. The video is written to
`data/demo/<scenario>.webm` under [`DATA_DIR`](../specs/runtime/configuration.md#persistence);
a failed run prints the unmet end state and writes no video.

## Record Against Local Development

Start [main development](local-development.md#run-main-development), then pass
its origin and the development `user` account's password:

```sh
REMDO_USER_PASSWORD=user-password-1234 pnpm demo:record outlining http://localhost:4000
```

Development pages show debugging surfaces that production omits.
