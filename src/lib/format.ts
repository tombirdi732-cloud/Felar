export function formatPrice(rub: number): string {
  return new Intl.NumberFormat("ru-RU").format(rub) + " ₽";
}

export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** «на платформе с марта 2026» */
export function formatMonthYear(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(d);
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function timeAgo(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${plural(min, "минуту", "минуты", "минут")} назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ${plural(h, "час", "часа", "часов")} назад`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} ${plural(days, "день", "дня", "дней")} назад`;
  return formatDate(d);
}
