import { prisma } from "@/lib/db";
import { CategoryForm, CategoryToggle } from "@/components/AdminActions";

export default async function AdminCategoriesPage() {
  const categories = await prisma.category.findMany({
    where: { parentId: null },
    orderBy: { sortOrder: "asc" },
    include: {
      children: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { listings: true } } } },
      _count: { select: { listings: true } },
    },
  });

  const parents = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <h2 className="text-xl font-bold">Структура каталога</h2>
      <p className="mt-1 text-sm text-ink-500">
        Скрытые категории не показываются в каталоге и фильтрах, объявления в них сохраняются.
      </p>

      <div className="card mt-4 p-5">
        <h3 className="mb-3 font-semibold">Добавить категорию</h3>
        <CategoryForm parents={parents} />
      </div>

      <ul className="mt-4 space-y-3">
        {categories.map((c) => (
          <li key={c.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-lg font-bold">
                {c.name}{" "}
                <span className="text-sm font-normal text-ink-500">
                  /{c.slug} · объявлений: {c._count.listings}
                  {!c.active && " · скрыта"}
                </span>
              </p>
              <CategoryToggle categoryId={c.id} active={c.active} />
            </div>
            {c.children.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-ink-100 pt-3">
                {c.children.map((ch) => (
                  <li key={ch.id} className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
                    <span>
                      {ch.name}{" "}
                      <span className="text-sm text-ink-500">
                        /{ch.slug} · {ch._count.listings}
                        {!ch.active && " · скрыта"}
                      </span>
                    </span>
                    <CategoryToggle categoryId={ch.id} active={ch.active} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
