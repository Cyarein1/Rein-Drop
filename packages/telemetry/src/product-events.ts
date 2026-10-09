import {
  idSchema,
  productEventPropertiesSchemas,
  type ProductEventName,
  type ProductEventProperties,
  type ProductEventSource,
} from '@rein-drop/contracts';
import type { ProductEventProvider } from './provider.js';

export interface ProductEventsOptions {
  source: ProductEventSource;
  clock?: () => Date;
  /** Reports dropped / failed events. Receives names and property PATHS only, never values. */
  onProblem?: (message: string) => void;
}

/**
 * The one way the apps record product events. track() is fire-and-forget: it never throws and
 * never waits, so telemetry can't fail or slow a user's request or a worker job.
 *
 * Every event is checked against the catalog (packages/contracts product-events.ts) before it
 * reaches the provider: an unknown property, a wrong type or a non-UUID user id drops the event
 * (reported by path, without values) instead of sending something the catalog doesn't allow.
 */
export class ProductEvents {
  private readonly clock: () => Date;
  private readonly onProblem: (message: string) => void;

  constructor(
    private readonly provider: ProductEventProvider,
    private readonly options: ProductEventsOptions,
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.onProblem = options.onProblem ?? (() => undefined);
  }

  get providerId(): string {
    return this.provider.id;
  }

  track<N extends ProductEventName>(name: N, distinctId: string, properties: ProductEventProperties<N>): void {
    try {
      const schema = productEventPropertiesSchemas[name];
      if (!schema) return this.onProblem(`product event "${String(name)}" dropped: not in the catalog`);
      if (!idSchema.safeParse(distinctId).success) return this.onProblem(`product event "${name}" dropped: distinctId is not an internal user id`);
      const parsed = schema.safeParse(properties);
      if (!parsed.success) {
        const paths = parsed.error.issues.map((i) => i.path.map(String).join('.') || '(root)').join(', ');
        return this.onProblem(`product event "${name}" dropped: invalid properties (${paths})`);
      }
      const sent = this.provider.capture({
        name,
        distinctId,
        occurredAt: this.clock().toISOString(),
        source: this.options.source,
        properties: parsed.data as ProductEventProperties<N>,
      });
      if (sent && typeof sent.then === 'function') sent.catch((err: unknown) => this.onProblem(`product event "${name}" not sent: ${describe(err)}`));
    } catch (err) {
      this.onProblem(`product event "${name}" not sent: ${describe(err)}`);
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.provider.shutdown?.();
    } catch (err) {
      this.onProblem(`product events shutdown failed: ${describe(err)}`);
    }
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message.trim().split('\n')[0]!.slice(0, 200) : 'unknown error';
}
