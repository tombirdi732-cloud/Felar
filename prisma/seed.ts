/**
 * Сид структуры каталога (категории и подкатегории из ТЗ, п. 4.4).
 *
 * ВАЖНО (ТЗ, п. 9): сид создаёт ТОЛЬКО структуру каталога — конфигурацию
 * платформы. Никакие объявления, пользователи, отзывы или иной контент
 * «для примера» здесь не создаются и создаваться не должны.
 *
 * Сид идемпотентен: повторный запуск ничего не дублирует.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CategorySeed = {
  slug: string;
  name: string;
  children?: { slug: string; name: string }[];
};

const categories: CategorySeed[] = [
  {
    slug: "elektroinstrument",
    name: "Электроинструмент",
    children: [
      { slug: "dreli", name: "Дрели" },
      { slug: "perforatory", name: "Перфораторы" },
      { slug: "shurupoverty", name: "Шуруповёрты" },
      { slug: "bolgarki", name: "Болгарки (УШМ)" },
      { slug: "lobziki-pily", name: "Лобзики и пилы" },
      { slug: "shlifmashiny", name: "Шлифмашины" },
    ],
  },
  {
    slug: "stroitelnaya-tekhnika",
    name: "Строительная техника",
    children: [
      { slug: "betonomeshalki", name: "Бетономешалки" },
      { slug: "lesa-i-vyshki", name: "Леса и вышки" },
      { slug: "generatory", name: "Генераторы" },
      { slug: "kompressory", name: "Компрессоры" },
      { slug: "vibroplity", name: "Виброплиты и трамбовки" },
    ],
  },
  {
    slug: "sadovaya-tekhnika",
    name: "Садовая техника",
    children: [
      { slug: "trimmery", name: "Триммеры" },
      { slug: "gazonokosilki", name: "Газонокосилки" },
      { slug: "motobloki", name: "Мотоблоки и культиваторы" },
      { slug: "benzopily", name: "Бензопилы" },
    ],
  },
  {
    slug: "klining-tekhnika",
    name: "Клининг-техника",
    children: [
      { slug: "moyki-vysokogo-davleniya", name: "Мойки высокого давления" },
      { slug: "paroochistiteli", name: "Пароочистители" },
      { slug: "stroitelnye-pylesosy", name: "Строительные пылесосы" },
    ],
  },
  {
    slug: "izmeritelnoe-oborudovanie",
    name: "Измерительное оборудование",
    children: [
      { slug: "niveliry", name: "Нивелиры" },
      { slug: "lazernye-urovni", name: "Лазерные уровни" },
      { slug: "dalnomery", name: "Дальномеры" },
    ],
  },
  {
    slug: "prochee",
    name: "Прочее",
  },
];

async function main() {
  let order = 0;
  for (const cat of categories) {
    const parent = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, sortOrder: order },
      create: { slug: cat.slug, name: cat.name, sortOrder: order },
    });
    order++;
    let childOrder = 0;
    for (const child of cat.children ?? []) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        update: { name: child.name, parentId: parent.id, sortOrder: childOrder },
        create: {
          slug: child.slug,
          name: child.name,
          parentId: parent.id,
          sortOrder: childOrder,
        },
      });
      childOrder++;
    }
  }
  console.log("Структура каталога создана/обновлена.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
