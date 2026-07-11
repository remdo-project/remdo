export function resolveAuthLogger(isProduction: boolean) {
  return isProduction
    ? { disabled: true } as const
    : { level: 'error' } as const;
}
