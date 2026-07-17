import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Logo } from "./Logo";
import { IconChat, IconHeart, IconPlus, IconSearch, IconUser } from "./Icons";

async function getUnreadCount(userId: string): Promise<number> {
  return prisma.message.count({
    where: {
      readAt: null,
      senderId: { not: userId },
      conversation: {
        OR: [{ renterId: userId }, { listing: { userId } }],
      },
    },
  });
}

export async function Header() {
  const user = await getCurrentUser();
  const unread = user ? await getUnreadCount(user.id) : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-5">
        <Logo />

        <form action="/catalog" className="relative hidden flex-1 md:block">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500" />
          <input
            type="search"
            name="q"
            placeholder="Найти инструмент или технику…"
            className="field pl-11"
            aria-label="Поиск по объявлениям"
          />
        </form>

        <nav className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link href="/catalog" className="btn-ghost md:hidden" aria-label="Поиск">
            <IconSearch className="h-5 w-5" />
          </Link>
          <Link href="/favorites" className="btn-ghost" aria-label="Избранное">
            <IconHeart className="h-5 w-5" />
            <span className="hidden lg:inline">Избранное</span>
          </Link>
          <Link href="/messages" className="btn-ghost relative" aria-label="Сообщения">
            <IconChat className="h-5 w-5" />
            <span className="hidden lg:inline">Сообщения</span>
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white lg:static lg:ml-1">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          {user ? (
            <Link href="/profile" className="btn-ghost" aria-label="Профиль">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <IconUser className="h-5 w-5" />
              )}
              <span className="hidden max-w-28 truncate lg:inline">{user.name}</span>
            </Link>
          ) : (
            <Link href="/auth" className="btn-ghost">
              <IconUser className="h-5 w-5" />
              <span className="hidden sm:inline">Войти</span>
            </Link>
          )}
          <Link href="/listing/new" className="btn-primary ml-1 !px-3.5 sm:!px-5">
            <IconPlus className="h-5 w-5" />
            <span className="hidden sm:inline">Разместить</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
