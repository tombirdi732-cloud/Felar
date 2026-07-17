/** Заглушка «нет фото» — фирменное изображение заказчика. */
export function NoPhoto() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/no-photo.webp"
      alt="Нет фото"
      loading="lazy"
      className="h-full w-full object-cover"
    />
  );
}
