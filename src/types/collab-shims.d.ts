declare module 'lib0/encoding' {
  export type Encoder = unknown;

  export function createEncoder(): Encoder;
  export function writeVarUint(encoder: Encoder, value: number): void;
  export function toUint8Array(encoder: Encoder): Uint8Array;
}

declare module 'y-protocols/sync' {
  export function writeSyncStep1(encoder: unknown, doc: import('yjs').Doc): void;
}

declare module 'lib0/encoding.js' {
  export * from 'lib0/encoding';
}

declare module 'y-protocols/sync.js' {
  export * from 'y-protocols/sync';
}

export {};
