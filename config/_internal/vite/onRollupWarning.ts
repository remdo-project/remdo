interface RollupWarningLike {
  code?: string;
  message: string;
}

// Some upstream packages, currently @mantine/core and react-router, ship
// React's "use client" directives in ESM.
// Rollup ignores them in this plain client bundle and emits noisy
// MODULE_LEVEL_DIRECTIVE warnings that do not indicate a RemDo issue.
export function onRollupWarning(
  warning: RollupWarningLike,
  warn: (warning: RollupWarningLike) => void
) {
  if (
    warning.code === 'MODULE_LEVEL_DIRECTIVE'
    && warning.message.includes('"use client"')
  ) {
    return;
  }

  warn(warning);
}
