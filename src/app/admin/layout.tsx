import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Админ-панель",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  if (user.role !== "ADMIN") redirect("/");

  const tabs = [
    { href: "/admin", label: "Жалобы и заявки" },
    { href: "/admin/listings", label: "Объявления" },
    { href: "/admin/users", label: "Пользователи" },
    { href: "/admin/categories", label: "Категории" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Админ-панель</h1>
      <nav className="mt-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-full border border-ink-300 bg-white px-4 py-1.5 text-sm font-medium text-ink-700 transition hover:border-brand-500 hover:text-brand-700"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  );
}
