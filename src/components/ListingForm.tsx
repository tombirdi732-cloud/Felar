"use client";

import { useActionState, useState } from "react";
import type { ListingFormState } from "@/actions/listing";
import { SubmitButton } from "./SubmitButton";
import { IconCamera, IconClose } from "./Icons";

type CategoryOption = {
  id: string;
  name: string;
  children: { id: string; name: string }[];
};

export type ListingFormValues = {
  title?: string;
  categoryId?: string;
  description?: string;
  pricePerDay?: number;
  priceWeek?: number | null;
  priceMonth?: number | null;
  deposit?: number;
  city?: string;
  district?: string | null;
  lat?: number | null;
  lng?: number | null;
  conditions?: string | null;
};

const MAX_PHOTOS = 8;

export function ListingForm({
  action,
  categories,
  captcha,
  values = {},
  existingPhotos = [],
  submitLabel,
}: {
  action: (prev: ListingFormState, formData: FormData) => Promise<ListingFormState>;
  categories: CategoryOption[];
  captcha?: { question: string; token: string };
  values?: ListingFormValues;
  existingPhotos?: { id: string; url: string }[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ListingFormState, FormData>(action, {});
  const [previews, setPreviews] = useState<string[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(
    values.lat != null && values.lng != null ? { lat: values.lat, lng: values.lng } : null
  );

  const keptExisting = existingPhotos.filter((p) => !removed.has(p.id));
  const slotsLeft = MAX_PHOTOS - keptExisting.length;

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files).slice(0, slotsLeft);
    setPreviews(list.map((f) => URL.createObjectURL(f)));
  };

  const detectGeo = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) =>
        setGeo({
          // округление до ~1 км — точный адрес не публикуется (ТЗ п. 4.3)
          lat: Math.round(pos.coords.latitude * 100) / 100,
          lng: Math.round(pos.coords.longitude * 100) / 100,
        }),
      () => alert("Не удалось определить местоположение. Проверьте разрешение в браузере.")
    );
  };

  return (
    <form action={formAction} className="space-y-6">
      <div className="card space-y-5 p-6">
        <h2 className="text-lg font-bold">Об инструменте</h2>
        <div>
          <label className="label" htmlFor="title">Название *</label>
          <input
            id="title"
            name="title"
            required
            minLength={5}
            maxLength={120}
            defaultValue={values.title}
            placeholder="Например: Перфоратор Makita HR2470, 780 Вт"
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="categoryId">Категория *</label>
          <select id="categoryId" name="categoryId" required defaultValue={values.categoryId ?? ""} className="field">
            <option value="" disabled>Выберите категорию</option>
            {categories.map((c) => (
              <optgroup key={c.id} label={c.name}>
                <option value={c.id}>{c.name} (общая)</option>
                {c.children.map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="description">Описание *</label>
          <textarea
            id="description"
            name="description"
            required
            minLength={20}
            rows={6}
            defaultValue={values.description}
            placeholder="Состояние, комплектация, для каких работ подходит, что входит в аренду…"
            className="field resize-y"
          />
        </div>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="text-lg font-bold">Фото</h2>
        <p className="text-sm text-ink-500">От 1 до {MAX_PHOTOS} фото. Первое станет обложкой. Изображения сжимаются автоматически.</p>

        {keptExisting.length > 0 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {existingPhotos.map((p) => (
              <div key={p.id} className={`relative aspect-square overflow-hidden rounded-lg ${removed.has(p.id) ? "opacity-30" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() =>
                    setRemoved((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      return next;
                    })
                  }
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink-900/70 text-white"
                  aria-label={removed.has(p.id) ? "Вернуть фото" : "Удалить фото"}
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        {[...removed].map((id) => (
          <input key={id} type="hidden" name="removePhoto" value={id} />
        ))}

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-ink-300 px-4 py-8 text-ink-500 transition hover:border-brand-500 hover:text-brand-600">
          <IconCamera className="h-8 w-8" />
          <span className="text-[15px] font-medium">Нажмите, чтобы выбрать фото</span>
          <span className="text-xs">JPG, PNG, HEIC — до 12 МБ каждое</span>
          <input
            type="file"
            name="photos"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>

        {previews.length > 0 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {previews.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="" className="aspect-square rounded-lg object-cover" />
            ))}
          </div>
        )}
      </div>

      <div className="card space-y-5 p-6">
        <h2 className="text-lg font-bold">Цена и залог</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="pricePerDay">За сутки, ₽ *</label>
            <input id="pricePerDay" name="pricePerDay" type="number" required min={1} defaultValue={values.pricePerDay} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="priceWeek">За неделю, ₽</label>
            <input id="priceWeek" name="priceWeek" type="number" min={1} defaultValue={values.priceWeek ?? ""} placeholder="Скидка за срок" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="priceMonth">За месяц, ₽</label>
            <input id="priceMonth" name="priceMonth" type="number" min={1} defaultValue={values.priceMonth ?? ""} placeholder="Скидка за срок" className="field" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="deposit">Залог, ₽ (0 — без залога)</label>
          <input id="deposit" name="deposit" type="number" min={0} defaultValue={values.deposit ?? 0} className="field sm:max-w-xs" />
          <p className="mt-1.5 text-sm text-ink-500">Залог передаётся владельцу лично при встрече — платформа его не удерживает.</p>
        </div>
      </div>

      <div className="card space-y-5 p-6">
        <h2 className="text-lg font-bold">Где забирать</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="city">Город *</label>
            <input id="city" name="city" required defaultValue={values.city} placeholder="Москва" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="district">Район</label>
            <input id="district" name="district" defaultValue={values.district ?? ""} placeholder="Например, Марьино" className="field" />
          </div>
        </div>
        <div>
          <button type="button" onClick={detectGeo} className="btn-secondary">
            {geo ? "Точка на карте отмечена ✓" : "Отметить примерную точку на карте"}
          </button>
          <p className="mt-1.5 text-sm text-ink-500">
            Публикуется примерная точка (с точностью до района) — точный адрес вы сообщите арендатору сами.
          </p>
          <input type="hidden" name="lat" value={geo?.lat ?? ""} />
          <input type="hidden" name="lng" value={geo?.lng ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="conditions">Условия аренды</label>
          <textarea
            id="conditions"
            name="conditions"
            rows={3}
            defaultValue={values.conditions ?? ""}
            placeholder="Например: только самовывоз, проверка при получении, залог или паспорт…"
            className="field resize-y"
          />
        </div>
      </div>

      {captcha && (
        <div className="card p-6">
          <label className="label" htmlFor="captchaAnswer">
            Проверка: сколько будет {captcha.question}? *
          </label>
          <input id="captchaAnswer" name="captchaAnswer" required inputMode="numeric" className="field sm:max-w-40" />
          <input type="hidden" name="captchaToken" value={captcha.token} />
        </div>
      )}

      {state.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700">{state.error}</p>
      )}

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Сохраняем…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
