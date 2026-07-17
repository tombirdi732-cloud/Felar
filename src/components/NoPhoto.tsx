import { IconCamera } from "./Icons";

/**
 * Заглушка «нет фото» (ТЗ п. 5 — финальная версия предоставляется заказчиком,
 * заменяется в этом компоненте).
 */
export function NoPhoto() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-ink-100 text-ink-500/60">
      <IconCamera className="h-10 w-10" />
      <span className="text-xs font-medium">Нет фото</span>
    </div>
  );
}
