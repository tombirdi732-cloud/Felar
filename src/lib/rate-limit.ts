/**
 * Простое ограничение частоты действий (антифлуд/антиспам, ТЗ п. 7).
 * Хранится в памяти процесса — при горизонтальном масштабировании
 * заменяется на Redis без изменения вызывающего кода.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowSec: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

// Периодическая очистка устаревших записей
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
}, 60_000).unref?.();
