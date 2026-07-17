"use client";

import { useActionState } from "react";
import { requestPhoneCode, verifyPhoneCode, type AuthState } from "@/actions/auth";
import { SubmitButton } from "./SubmitButton";
import { IconVk } from "./Icons";

export function AuthForm({ vkEnabled, loggedIn }: { vkEnabled: boolean; loggedIn: boolean }) {
  const [requestState, requestAction] = useActionState<AuthState, FormData>(requestPhoneCode, {});
  const [verifyState, verifyAction] = useActionState<AuthState, FormData>(verifyPhoneCode, {});

  const phase = verifyState.codeSent || requestState.codeSent ? "verify" : "request";
  const phone = verifyState.phone ?? requestState.phone;
  const error = phase === "verify" ? verifyState.error : requestState.error ?? verifyState.error;

  return (
    <div className="space-y-5">
      {!loggedIn && (
        <>
          {vkEnabled ? (
            <a
              href="/api/auth/vk"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#07f] px-5 py-3 font-semibold text-white transition hover:bg-[#0066dd]"
            >
              <IconVk className="h-6 w-6" />
              Войти через VK ID
            </a>
          ) : (
            <div className="rounded-xl bg-ink-50 px-4 py-3 text-sm leading-relaxed text-ink-500">
              <span className="flex items-center gap-2 font-semibold text-ink-700">
                <IconVk className="h-5 w-5 text-[#07f]" /> Вход через VK ID
              </span>
              Основной способ входа появится после подключения приложения VK ID
              (переменные VK_CLIENT_ID / VK_CLIENT_SECRET).
            </div>
          )}

          <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-ink-500">
            <span className="h-px flex-1 bg-ink-100" />
            {vkEnabled ? "или по номеру телефона" : "вход по номеру телефона"}
            <span className="h-px flex-1 bg-ink-100" />
          </div>
        </>
      )}

      {phase === "request" ? (
        <form action={requestAction} className="space-y-3">
          <div>
            <label className="label" htmlFor="phone">Номер телефона</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              placeholder="+7 900 000-00-00"
              className="field"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <SubmitButton className="btn-primary w-full" pendingText="Отправляем код…">
            Получить код из SMS
          </SubmitButton>
        </form>
      ) : (
        <form action={verifyAction} className="space-y-3">
          <input type="hidden" name="phone" value={phone ?? ""} />
          <p className="text-[15px] text-ink-700">
            Код отправлен на <b>{phone}</b>
          </p>
          {(requestState.devHint || verifyState.devHint) && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {requestState.devHint ?? verifyState.devHint}
            </p>
          )}
          <div>
            <label className="label" htmlFor="code">Код из SMS</label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              autoFocus
              placeholder="••••"
              className="field text-center text-xl tracking-[0.5em]"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <SubmitButton className="btn-primary w-full" pendingText="Проверяем…">
            Подтвердить
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
