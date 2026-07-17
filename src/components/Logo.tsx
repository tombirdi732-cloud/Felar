/**
 * Логотип Tom | СтройАренда (файл заказчика: public/brand/logo.png).
 * Эмблема круглая, поэтому обрезается rounded-full — одинаково хорошо
 * смотрится на светлом и тёмном фоне.
 */
import Link from "next/link";

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 select-none"
      aria-label="Tom | СтройАренда — на главную"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo.png"
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
      <span className="flex items-baseline gap-1.5 whitespace-nowrap text-lg font-extrabold tracking-tight sm:text-xl">
        <span className="text-brand-500">Tom</span>
        <span className={dark ? "text-white/40" : "text-ink-300"}>|</span>
        <span className={dark ? "text-white" : "text-ink-900"}>СтройАренда</span>
      </span>
    </Link>
  );
}
