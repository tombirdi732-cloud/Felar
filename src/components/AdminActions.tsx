"use client";

import { useActionState, useTransition } from "react";
import {
  blockListing,
  blockUser,
  grantVerification,
  resolveReport,
  saveCategory,
  toggleCategory,
  type CategoryState,
} from "@/actions/admin";
import { SubmitButton } from "./SubmitButton";

function useRun() {
  const [pending, startTransition] = useTransition();
  return {
    pending,
    run: (fn: () => Promise<unknown>) => startTransition(async () => { await fn(); }),
  };
}

const btn = "btn-secondary !px-3 !py-1.5 text-sm";

export function ReportActions({ reportId }: { reportId: string }) {
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap gap-2" aria-busy={pending}>
      <button type="button" disabled={pending} className={`${btn} text-emerald-700`}
        onClick={() => run(() => resolveReport(reportId, "RESOLVED", "Меры приняты"))}>
        Решено
      </button>
      <button type="button" disabled={pending} className={btn}
        onClick={() => run(() => resolveReport(reportId, "DISMISSED", "Нарушений не найдено"))}>
        Отклонить
      </button>
    </div>
  );
}

export function ListingModerationActions({ listingId, blocked }: { listingId: string; blocked: boolean }) {
  const { pending, run } = useRun();
  return (
    <button type="button" disabled={pending}
      className={`${btn} ${blocked ? "text-emerald-700" : "text-red-600"}`}
      onClick={() => run(() => blockListing(listingId, !blocked))}>
      {blocked ? "Разблокировать" : "Заблокировать"}
    </button>
  );
}

export function UserModerationActions({
  userId,
  blocked,
  docVerified,
  docRequested,
}: {
  userId: string;
  blocked: boolean;
  docVerified: boolean;
  docRequested: boolean;
}) {
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap gap-2" aria-busy={pending}>
      {(docRequested || docVerified) && (
        <button type="button" disabled={pending} className={`${btn} ${docVerified ? "" : "text-emerald-700"}`}
          onClick={() => run(() => grantVerification(userId, !docVerified))}>
          {docVerified ? "Снять бейдж" : "Выдать бейдж"}
        </button>
      )}
      <button type="button" disabled={pending}
        className={`${btn} ${blocked ? "text-emerald-700" : "text-red-600"}`}
        onClick={() => run(() => blockUser(userId, !blocked))}>
        {blocked ? "Разблокировать" : "Заблокировать"}
      </button>
    </div>
  );
}

export function CategoryForm({
  parents,
  category,
}: {
  parents: { id: string; name: string }[];
  category?: { id: string; name: string; parentId: string | null };
}) {
  const [state, formAction] = useActionState<CategoryState, FormData>(saveCategory, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {category && <input type="hidden" name="id" value={category.id} />}
      <div className="min-w-40 flex-1">
        <input
          name="name"
          required
          minLength={2}
          defaultValue={category?.name}
          placeholder="Название категории"
          className="field !py-2"
        />
      </div>
      <select name="parentId" defaultValue={category?.parentId ?? ""} className="field max-w-56 !py-2">
        <option value="">Корневая категория</option>
        {parents
          .filter((p) => p.id !== category?.id)
          .map((p) => (
            <option key={p.id} value={p.id}>в «{p.name}»</option>
          ))}
      </select>
      <SubmitButton className="btn-primary !py-2">{category ? "Сохранить" : "Добавить"}</SubmitButton>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

export function CategoryToggle({ categoryId, active }: { categoryId: string; active: boolean }) {
  const { pending, run } = useRun();
  return (
    <button type="button" disabled={pending}
      className={`${btn} ${active ? "text-red-600" : "text-emerald-700"}`}
      onClick={() => run(() => toggleCategory(categoryId, !active))}>
      {active ? "Скрыть" : "Показать"}
    </button>
  );
}
