/**
 * Product events (beta telemetry). The event catalog and its privacy rules live in
 * @rein-drop/contracts (product-events.ts); this package records them through a replaceable
 * ProductEventProvider. Framework-free: the apps pass their logger in.
 */
export * from './provider.js';
export * from './product-events.js';
export * from './config.js';
