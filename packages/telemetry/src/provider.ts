import type { ProductEvent } from '@rein-drop/contracts';

/**
 * Where product events go. Implementations: `log` (structured log line - the default until a
 * vendor is approved, D15), `none`, and an in-memory one for tests. A vendor SDK (e.g. PostHog)
 * is added as another implementation; nothing outside this package changes.
 *
 * capture() receives events that already passed the catalog's strict schemas. It must not block
 * the caller: a network provider queues / batches and sends in the background.
 */
export interface ProductEventProvider {
  readonly id: string;
  capture(event: ProductEvent): void | Promise<void>;
  /** Flush anything queued (called on shutdown). */
  shutdown?(): Promise<void>;
}

/** Drops everything (PRODUCT_EVENTS_PROVIDER=none). */
export class NoopProductEventProvider implements ProductEventProvider {
  readonly id = 'none';
  capture(): void {}
}

/** One structured log line per event. `log` is the app's logger (JSON or text, like request logs). */
export class LogProductEventProvider implements ProductEventProvider {
  readonly id = 'log';

  constructor(
    private readonly log: (entry: object | string) => void,
    private readonly format: 'json' | 'text' = 'json',
  ) {}

  capture(event: ProductEvent): void {
    this.log(
      this.format === 'json'
        ? { event: 'product_event', name: event.name, distinctId: event.distinctId, occurredAt: event.occurredAt, source: event.source, properties: event.properties }
        : `product_event ${event.name} user=${event.distinctId} ${JSON.stringify(event.properties)}`,
    );
  }
}

/** Keeps events in memory - for tests. */
export class MemoryProductEventProvider implements ProductEventProvider {
  readonly id = 'memory';
  readonly events: ProductEvent[] = [];

  capture(event: ProductEvent): void {
    this.events.push(event);
  }

  /** Events of one name (optionally for one user), oldest first. */
  named<N extends ProductEvent['name']>(name: N, distinctId?: string): ProductEvent<N>[] {
    return this.events.filter((e): e is ProductEvent<N> => e.name === name && (distinctId === undefined || e.distinctId === distinctId));
  }

  clear(): void {
    this.events.length = 0;
  }
}
