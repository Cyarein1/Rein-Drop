/** The ProductEventProvider in use (tests override it with a MemoryProductEventProvider). */
export const PRODUCT_EVENT_PROVIDER = Symbol('PRODUCT_EVENT_PROVIDER');
/** `@Inject(PRODUCT_EVENTS) events: ProductEvents` - record product events (fire-and-forget). */
export const PRODUCT_EVENTS = Symbol('PRODUCT_EVENTS');
