"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestDocVerification, updateProfile, type ProfileState } from "@/actions/profile";
import { SubmitButton } from "./SubmitButton";

export function ProfileForm({
  defaults,
}: {
  defaults: { name: string; city: string; about: string };
}) {
  const [state, formAction] = useActionState<ProfileState, FormData>(updateProfile, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="p-name">Имя *</label>
          <input id="p-name" name="name" required minLength={2} maxLength={60} defaultValue={defaults.name} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="p-city">Город</label>
          <input id="p-city" name="city" maxLength={80} defaultValue={defaults.city} placeholder="Москва" className="field" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="p-about">О себе</label>
        <textarea
          id="p-about"
          name="about"
          rows={3}
          maxLength={1000}
          defaultValue={defaults.about}
          placeholder="Пара слов о себе: чем занимаетесь, какой инструмент сдаёте…"
          className="field resize-y"
        />
      </div>
      <div>
        <label className="label" htmlFor="p-avatar">Аватар</label>
        <input id="p-avatar" name="avatar" type="file" accept="image/*" className="field !py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:font-medium file:text-brand-700" />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">Профиль сохранён.</p>}
      <SubmitButton>Сохранить</SubmitButton>
    </form>
  );
}

export function DocVerificationForm({ phoneVerified }: { phoneVerified: boolean }) {
  const [state, formAction] = useActionState<ProfileState, FormData>(requestDocVerification, {});

  if (!phoneVerified) {
    return (
      <p className="text-sm text-ink-500">
        Сначала <Link href="/auth" className="font-medium text-brand-700 underline">подтвердите телефон</Link> — затем можно подать заявку на бейдж.
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        Заявка отправлена. Модератор проверит документ и выдаст бейдж.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input
        name="document"
        type="file"
        accept="image/*"
        required
        className="field max-w-xs !py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:font-medium file:text-brand-700"
      />
      <SubmitButton className="btn-secondary" pendingText="Отправляем…">
        Отправить на проверку
      </SubmitButton>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
