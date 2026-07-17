import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-ink-100 bg-ink-900 text-ink-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo dark />
          <p className="mt-3 max-w-xs text-sm leading-relaxed">
            Аренда инструмента и техники у людей рядом. Платформа сводит владельца и
            арендатора — оплата и залог передаются лично при встрече.
          </p>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white">Арендаторам</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/catalog" className="hover:text-white">Каталог инструмента</Link></li>
            <li><Link href="/favorites" className="hover:text-white">Избранное</Link></li>
            <li><Link href="/#how-it-works" className="hover:text-white">Как это работает</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white">Арендодателям</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/listing/new" className="hover:text-white">Разместить объявление</Link></li>
            <li><Link href="/profile/listings" className="hover:text-white">Мои объявления</Link></li>
            <li><Link href="/profile" className="hover:text-white">Верификация</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white">Безопасность</h3>
          <ul className="space-y-2 text-sm">
            <li>Проверяйте инструмент при получении</li>
            <li>Передавайте залог только лично</li>
            <li>Смотрите на рейтинг и бейдж верификации</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-ink-500">
          <span>© {new Date().getFullYear()} Felar. Платформа не принимает платежи и залоги.</span>
          <span>Сделано для людей, которые делают сами.</span>
        </div>
      </div>
    </footer>
  );
}
