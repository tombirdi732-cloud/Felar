/**
 * Плейсхолдер логотипа (ТЗ п. 5: финальный логотип предоставляет заказчик —
 * файл заменяется здесь, в шапке и футере ничего менять не нужно).
 */
import Link from "next/link";

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 select-none" aria-label="Felar — на главную">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-lg font-black text-white">
        F
      </span>
      <span className={`text-xl font-extrabold tracking-tight ${dark ? "text-white" : "text-ink-900"}`}>
        Felar
        <span className="text-brand-600">.</span>
      </span>
    </Link>
  );
}
