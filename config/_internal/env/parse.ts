export type Primitive = string | number | boolean;

export interface EnvSpecEntry<T extends Primitive> {
  readonly default: T;
  readonly client?: boolean;
}

export interface EnvSpec {
  readonly [key: string]: EnvSpecEntry<Primitive>;
}

type ParsedValue<T extends EnvSpecEntry<Primitive>> = T['default'] extends boolean
  ? boolean
  : T['default'] extends number
    ? number
    : string;

export type ParsedEnv<T extends EnvSpec> = {
  [K in keyof T]: ParsedValue<T[K]>;
};

type ClientKeys<T extends EnvSpec> = {
  [K in keyof T]: T[K]['client'] extends true ? K : never;
}[keyof T];

export type ClientEnv<T extends EnvSpec> = Pick<ParsedEnv<T>, ClientKeys<T>>;

function coerceValue<T extends Primitive>(
  raw: string | boolean | undefined,
  fallback: T,
  key: string,
): T {
  if (raw === undefined || raw === '') {
    return fallback;
  }

  switch (typeof fallback) {
    case 'boolean':
      if (typeof raw === 'boolean') {
        return raw as T;
      }

      if (raw === 'true' || raw === 'false') {
        return (raw === 'true') as T;
      }

      throw new TypeError(`Expected "true" or "false" for ${key}, received "${raw}"`);
    case 'number': {
      const parsed = typeof raw === 'number' ? raw : Number(raw);

      if (!Number.isFinite(parsed)) {
        throw new TypeError(`Expected numeric value for ${key}, received "${raw}"`);
      }

      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
        throw new TypeError(`Expected integer between 0 and 65535 for ${key}, received "${raw}"`);
      }

      return parsed as T;
    }
    default:
      return (typeof raw === 'string' ? raw : String(raw)) as T;
  }
}

export function parseEnv<T extends EnvSpec>(
  schema: T,
  getter: (key: keyof T & string) => string | boolean | undefined,
): ParsedEnv<T> {
  const result: Partial<ParsedEnv<T>> = {};

  for (const key of Object.keys(schema) as Array<keyof T & string>) {
    const entry = schema[key];
    if (!entry) {
      throw new TypeError(`Missing schema entry for key "${key}"`);
    }

    result[key] = coerceValue(getter(key), entry.default, key) as ParsedEnv<T>[keyof T];
  }

  return result as ParsedEnv<T>;
}

export function pickClientEnv<T extends EnvSpec>(
  schema: T,
  env: ParsedEnv<T>,
): ClientEnv<T> {
  const clientEnv: Partial<ParsedEnv<T>> = {};

  for (const key of Object.keys(schema) as Array<keyof T>) {
    if (schema[key]?.client === true) {
      clientEnv[key] = env[key];
    }
  }

  return clientEnv as ClientEnv<T>;
}

export const defineEnvSpec = <
  const T extends Record<string, EnvSpecEntry<Primitive>>,
>(spec: T): T => spec;

export type EnvDerivatives<T extends EnvSpec> = (env: ParsedEnv<T>) => void;

export const defineEnvDerivatives = <
  const Spec extends EnvSpec,
  const Derivatives extends EnvDerivatives<Spec>,
>(_spec: Spec, derivatives: Derivatives): Derivatives => derivatives;

export const applyEnvDerivatives = <T extends EnvSpec>(
  env: ParsedEnv<T>,
  apply: EnvDerivatives<T>,
): ParsedEnv<T> => {
  const copy = { ...env };
  apply(copy);
  return copy;
};
