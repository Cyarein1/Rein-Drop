/** A translation of an English namespace: exactly the same keys, every value a string. */
export type Messages<T> = { readonly [K in keyof T]: string };
