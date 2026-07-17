import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getUserRating } from "@/lib/rating";
import { formatMonthYear, plural } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { logout } from "@/actions/auth";
import { ProfileForm, DocVerificationForm } from "@/components/ProfileForms";
import { Rating, VerifiedBadge } from "@/components/Rating";
import { IconUser } from "@/components/Icons";

export const metadata: Metadata = {
  title: "Мой профиль",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; verify?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const sp = await searchParams;

  const [rating, activeCount, reviewsCount] = await Promise.all([
    getUserRating(user.id),
    prisma.listing.count({ where: { userId: user.id, status: "ACTIVE" } }),
    prisma.review.count({ where: { authorId: user.id } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {(sp.welcome || sp.verify) && (
        <div className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-[15px] text-emerald-700">
          {sp.welcome
            ? "Добро пожаловать! Заполните профиль — имя и город видят другие пользователи."
            : "Вы вошли через VK. Для размещения объявлений подтвердите номер телефона ниже."}
        </div>
      )}

      <div className="card flex flex-wrap items-center gap-5 p-6">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <span className="grid h-20 w-20 place-items-center rounded-full bg-ink-100 text-ink-500">
            <IconUser className="h-9 w-9" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
            {user.name}
            {user.docVerified && <VerifiedBadge />}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
            <Rating value={rating.avg} count={rating.count} />
            <span>На платформе с {formatMonthYear(user.createdAt)}</span>
            {user.city && <span>{user.city}</span>}
          </div>
        </div>
        <form action={logout}>
          <button type="submit" className="btn-ghost text-red-600">Выйти</button>
        </form>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Link href="/profile/listings" className="card p-5 transition hover:shadow-card-hover">
          <p className="text-3xl font-extrabold text-brand-600">{activeCount}</p>
          <p className="mt-1 text-[15px] font-medium">
            {plural(activeCount, "активное объявление", "активных объявления", "активных объявлений")}
          </p>
          <p className="mt-0.5 text-sm text-ink-500">Управлять объявлениями →</p>
        </Link>
        <Link href="/profile/reviews" className="card p-5 transition hover:shadow-card-hover">
          <p className="text-3xl font-extrabold text-brand-600">{rating.count}</p>
          <p className="mt-1 text-[15px] font-medium">
            {plural(rating.count, "отзыв получен", "отзыва получено", "отзывов получено")}
          </p>
          <p className="mt-0.5 text-sm text-ink-500">Оставлено вами: {reviewsCount} →</p>
        </Link>
        <Link href="/messages" className="card p-5 transition hover:shadow-card-hover">
          <p className="text-3xl font-extrabold text-brand-600">💬</p>
          <p className="mt-1 text-[15px] font-medium">Сообщения</p>
          <p className="mt-0.5 text-sm text-ink-500">Перейти к диалогам →</p>
        </Link>
      </div>

      {/* Верификация */}
      <section className="card mt-4 p-6">
        <h2 className="text-lg font-bold">Доверие и верификация</h2>
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-50 px-4 py-3">
            <div>
              <p className="font-medium">Телефон</p>
              <p className="text-sm text-ink-500">
                {user.phoneVerified && user.phone
                  ? `Подтверждён: ${formatPhone(user.phone)}`
                  : "Не подтверждён — обязателен для размещения объявлений"}
              </p>
            </div>
            {user.phoneVerified ? (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">✓ Подтверждён</span>
            ) : (
              <Link href="/auth" className="btn-primary !py-2">Подтвердить</Link>
            )}
          </div>

          <div className="rounded-xl bg-ink-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">Бейдж «Верифицирован»</p>
                <p className="text-sm text-ink-500">
                  Фото паспорта или водительского удостоверения видит только модератор.
                  Бейдж повышает доверие к вашим объявлениям.
                </p>
              </div>
              {user.docVerified ? (
                <VerifiedBadge />
              ) : user.docRequested ? (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">На проверке</span>
              ) : null}
            </div>
            {!user.docVerified && !user.docRequested && (
              <div className="mt-3">
                <DocVerificationForm phoneVerified={user.phoneVerified} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Настройки профиля */}
      <section className="card mt-4 p-6">
        <h2 className="text-lg font-bold">Данные профиля</h2>
        <div className="mt-4">
          <ProfileForm
            defaults={{ name: user.name, city: user.city ?? "", about: user.about ?? "" }}
          />
        </div>
      </section>

      {user.role === "ADMIN" && (
        <div className="mt-4">
          <Link href="/admin" className="btn-secondary">Перейти в админ-панель</Link>
        </div>
      )}
    </div>
  );
}
