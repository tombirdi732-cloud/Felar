import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { vkConfigured } from "@/lib/vk";
import { AuthForm } from "@/components/AuthForm";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Вход и регистрация",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function AuthPage() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-14">
      <Logo />
      <div className="card mt-6 w-full p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">
          {user ? "Подтверждение телефона" : "Вход на СтройАренду"}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-500">
          {user
            ? "Подтверждённый номер обязателен для размещения объявлений и повышает доверие."
            : "Один аккаунт для аренды и сдачи инструмента. Регистрация происходит автоматически при первом входе."}
        </p>
        <div className="mt-6">
          <AuthForm vkEnabled={vkConfigured()} loggedIn={Boolean(user)} />
        </div>
        <p className="mt-6 text-xs leading-relaxed text-ink-500">
          Продолжая, вы соглашаетесь с правилами платформы. Tom | СтройАренда не обрабатывает платежи —
          все расчёты происходят лично между участниками.
        </p>
      </div>
    </div>
  );
}
