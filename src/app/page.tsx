import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCategoriesTree } from "@/lib/listings";
import { getRatingsForUsers } from "@/lib/rating";
import { ListingCard } from "@/components/ListingCard";
import { CategoryIcon, IconArrowRight, IconChat, IconHandshake, IconSearch, IconShield } from "@/components/Icons";
import { plural } from "@/lib/format";

export default async function HomePage() {
  const [categories, latest, user] = await Promise.all([
    getCategoriesTree(),
    prisma.listing.findMany({
      where: { status: "ACTIVE", user: { blocked: false } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        photos: { orderBy: { sortOrder: "asc" }, take: 1 },
        user: { select: { id: true, name: true, docVerified: true } },
      },
    }),
    getCurrentUser(),
  ]);

  const ratings = await getRatingsForUsers(latest.map((l) => l.user.id));
  const favoriteIds = user
    ? new Set(
        (
          await prisma.favorite.findMany({
            where: { userId: user.id },
            select: { listingId: true },
          })
        ).map((f) => f.listingId)
      )
    : new Set<string>();

  return (
    <div>
      {/* Hero */}
      <section className="bg-ink-900">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-brand-300">
              Аренда между людьми — без посредников
            </p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
              Инструмент на день —{" "}
              <span className="text-brand-500">у соседа, а не в магазине</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-300">
              Перфоратор на выходные, бетономешалка на неделю, мойка высокого давления на день.
              Находите технику рядом, договаривайтесь в чате и забирайте лично.
            </p>
            <form action="/catalog" className="mt-7 flex max-w-xl gap-2">
              <div className="relative flex-1">
                <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500" />
                <input
                  type="search"
                  name="q"
                  placeholder="Что вам нужно? Например, перфоратор"
                  className="field h-13 !py-3.5 pl-11"
                  aria-label="Поиск инструмента"
                />
              </div>
              <button type="submit" className="btn-primary !py-3.5">Найти</button>
            </form>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm text-ink-300">
              <span className="flex items-center gap-2"><IconShield className="h-5 w-5 text-brand-500" /> Верификация владельцев</span>
              <span className="flex items-center gap-2"><IconChat className="h-5 w-5 text-brand-500" /> Встроенный чат</span>
              <span className="flex items-center gap-2"><IconHandshake className="h-5 w-5 text-brand-500" /> Залог — лично, без комиссий</span>
            </div>
          </div>
          <div className="hidden lg:grid grid-cols-2 gap-4">
            {categories.slice(0, 4).map((c) => (
              <Link
                key={c.id}
                href={`/catalog/${c.slug}`}
                className="group rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 transition hover:bg-white/10"
              >
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-600/20 text-brand-400 transition group-hover:bg-brand-600 group-hover:text-white">
                  <CategoryIcon slug={c.slug} className="h-6 w-6" />
                </div>
                <p className="mt-4 font-semibold text-white">{c.name}</p>
                <p className="mt-1 text-sm text-ink-500">
                  {c._count.listings}{" "}
                  {plural(c._count.listings, "объявление", "объявления", "объявлений")}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Категории */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Категории</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/catalog/${c.slug}`}
              className="card group flex flex-col items-start gap-3 p-4 transition hover:shadow-card-hover"
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                <CategoryIcon slug={c.slug} className="h-5.5 w-5.5" />
              </div>
              <div>
                <p className="font-semibold leading-tight text-ink-900">{c.name}</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {c._count.listings}{" "}
                  {plural(c._count.listings, "объявление", "объявления", "объявлений")}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Свежие объявления */}
      <section className="mx-auto max-w-7xl px-4 pb-4">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Свежие объявления</h2>
          {latest.length > 0 && (
            <Link href="/catalog" className="btn-ghost text-brand-700">
              Смотреть все <IconArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
        {latest.length === 0 ? (
          <div className="card mt-6 px-6 py-14 text-center">
            <h3 className="text-xl font-bold">Объявлений пока нет</h3>
            <p className="mx-auto mt-2 max-w-md text-[15px] text-ink-500">
              Платформа только запустилась. Станьте первым — разместите свой инструмент
              и начните зарабатывать на технике, которая простаивает.
            </p>
            <Link href="/listing/new" className="btn-primary mt-6">
              Разместить объявление
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {latest.map((l) => (
              <ListingCard
                key={l.id}
                listing={{ ...l, ownerRating: ratings.get(l.user.id) ?? null }}
                isFavorite={favoriteIds.has(l.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Как это работает */}
      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-14">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Как это работает</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: <IconSearch className="h-6 w-6" />,
              title: "1. Найдите рядом",
              text: "Поиск по названию, категории и городу. Смотрите цену за сутки, залог и рейтинг владельца.",
            },
            {
              icon: <IconChat className="h-6 w-6" />,
              title: "2. Договоритесь в чате",
              text: "Напишите владельцу прямо на сайте: уточните состояние, сроки и место встречи.",
            },
            {
              icon: <IconHandshake className="h-6 w-6" />,
              title: "3. Встретьтесь лично",
              text: "Осмотрите инструмент, передайте залог из рук в руки и пользуйтесь. Платформа не берёт комиссий.",
            },
          ].map((s) => (
            <div key={s.title} className="card p-6">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-600">
                {s.icon}
              </div>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-1.5 leading-relaxed text-ink-500">{s.text}</p>
            </div>
          ))}
        </div>
        <div className="card mt-4 flex flex-col items-center justify-between gap-4 bg-gradient-to-r from-brand-600 to-brand-500 p-6 text-white shadow-none sm:flex-row sm:p-8">
          <div>
            <h3 className="text-xl font-bold sm:text-2xl">У вас простаивает инструмент?</h3>
            <p className="mt-1 text-white/85">Разместите объявление за пару минут — это бесплатно.</p>
          </div>
          <Link
            href="/listing/new"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-brand-700 transition hover:bg-brand-50"
          >
            Сдать в аренду <IconArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
