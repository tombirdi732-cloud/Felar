import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-6xl font-extrabold text-brand-600">404</p>
      <h1 className="mt-4 text-2xl font-bold">Страница не найдена</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-500">
        Возможно, объявление сняли с публикации или ссылка устарела.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className="btn-primary">На главную</Link>
        <Link href="/catalog" className="btn-secondary">В каталог</Link>
      </div>
    </div>
  );
}
