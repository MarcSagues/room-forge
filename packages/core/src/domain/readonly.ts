type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/**
 * Recursively readonly view of plain data. The session exposes the document through it so that
 * mutating it outside a command is a type error (ADR-0003). Branded ids stay as they are.
 */
export type DeepReadonly<T> = T extends Primitive
  ? T
  : { readonly [K in keyof T]: DeepReadonly<T[K]> };
