"use client";

import { useActionState, useState } from "react";
import { leaveReview, type ReviewState } from "@/actions/review";
import { IconClose, IconStar } from "./Icons";
import { SubmitButton } from "./SubmitButton";

export function ReviewForm({
  conversationId,
  companionName,
}: {
  conversationId: string;
  companionName: string;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const action = leaveReview.bind(null, conversationId);
  const [state, formAction] = useActionState<ReviewState, FormData>(action, {});

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Оставить отзыв"
        className="btn-secondary shrink-0 !px-3 text-sm"
      >
        <IconStar className="h-4 w-4" />
        <span className="hidden sm:inline">Оставить отзыв</span>
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
            <h2 className="text-lg font-bold">Отзыв о {companionName}</h2>
            <p className="mt-1 text-sm text-ink-500">
              Отзыв привязан к этой аренде и виден в профиле. Удалить его самостоятельно нельзя.
            </p>

            {state.ok ? (
              <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-[15px] text-emerald-700">
                Спасибо! Отзыв опубликован.
              </p>
            ) : (
              <form action={formAction} className="mt-4 space-y-4">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      aria-label={`Оценка ${n}`}
                      className="p-0.5"
                    >
                      <IconStar
                        className={`h-8 w-8 transition ${
                          n <= rating ? "fill-amber-400 stroke-amber-400" : "stroke-ink-300"
                        }`}
                      />
                    </button>
                  ))}
                  <input type="hidden" name="rating" value={rating} />
                </div>
                <textarea
                  name="text"
                  rows={4}
                  required
                  minLength={10}
                  placeholder="Как прошла аренда? Состояние инструмента, пунктуальность, общение…"
                  className="field resize-none"
                />
                {state.error && <p className="text-sm text-red-600">{state.error}</p>}
                <SubmitButton className="btn-primary w-full">Опубликовать отзыв</SubmitButton>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
