/**
 * In-memory cache: orderId → local PDF file URI.
 * Lives at module scope so it survives React navigation unmounts.
 */
const _cache: Record<string, string> = {};

export const pdfCache = {
  set(orderId: string, uri: string) { _cache[orderId] = uri; },
  get(orderId: string): string | undefined { return _cache[orderId]; },
  has(orderId: string): boolean { return !!_cache[orderId]; },
  delete(orderId: string) { delete _cache[orderId]; },
};
