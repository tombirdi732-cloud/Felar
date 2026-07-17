"use client";

import { useActionState, useState } from "react";
import { submitReport, type ReportState } from "@/actions/report";
import { IconClose, IconFlag } from "./Icons";
import { SubmitButton } from "./SubmitButton";

export function ReportButton({
  listingId,
  userId,
  authorized,
}: {
  listingId?: string;
  userId?: string;
  authorized: boolean;
}) {
  const [open, setOpen] = useState(false);
  const action = submitReport.bind(null, { listingId, userId });
  const [state, formAction] = useActionState<ReportState, FormData>(action, {});

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-red-600"
      >
        <IconFlag className="h-4 w-4" /> Пожаловаться
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setOpen(false)} />
          <div className="card relative w-full max-w-md p-6">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 text-ink-500 hover:text-ink-900"
              aria-label="Закрыть"
            >
              <IconClose className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-bold">Жалоба {listingId ? "на объявление" : "на пользователя"}</h2>

            {!authorized ? (
              <p className="mt-3 text-[15px] text-ink-500">
                Чтобы отправить жалобу, <a href="/auth" className="font-medium text-brand-700 underline">войдите</a>.
              </p>
            ) : state.ok ? (
              <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-[15px] text-emerald-700">
                Жалоба отправлена. Модератор рассмотрит её в ближайшее время.
              </p>
            ) : (
              <form action={formAction} className="mt-4 space-y-3">
                <textarea
                  name="reason"
                  rows={4}
                  required
                  minLength={10}
                  placeholder="Опишите, что не так: обман, запрещённый товар, оскорбления…"
                  className="field resize-none"
                />
                {state.error && <p className="text-sm text-red-600">{state.error}</p>}
                <SubmitButton className="btn-primary w-full">Отправить жалобу</SubmitButton>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
