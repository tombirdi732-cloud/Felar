/**
 * Набор интерфейсных SVG-иконок (плейсхолдеры).
 * По ТЗ (п. 5) финальный набор иконок предоставляет заказчик — каждая иконка
 * заменяется в одном месте, компонентный интерфейс сохраняется.
 */
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const IconFilter = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </svg>
);

export const IconChat = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12a8 8 0 0 1-8 8H4l2.3-2.9A8 8 0 1 1 21 12Z" />
  </svg>
);

export const IconHeart = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 20.5C7 16.6 3.5 13.4 3.5 9.7A4.6 4.6 0 0 1 8.1 5c1.6 0 3 .8 3.9 2a4.9 4.9 0 0 1 3.9-2 4.6 4.6 0 0 1 4.6 4.7c0 3.7-3.5 6.9-8.5 10.8Z" />
  </svg>
);

export const IconPin = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

export const IconStar = (p: P) => (
  <svg {...base(p)}>
    <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8L12 3Z" />
  </svg>
);

export const IconVerified = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 2.5 14.4 4l2.8-.2 1 2.7 2.3 1.6-.7 2.8.7 2.8-2.3 1.6-1 2.7-2.8-.2-2.4 1.5L9.6 20l-2.8.2-1-2.7-2.3-1.6.7-2.8-.7-2.8 2.3-1.6 1-2.7 2.8.2L12 2.5Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const IconShield = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3 5 6v5c0 4.5 3 8.1 7 10 4-1.9 7-5.5 7-10V6l-7-3Z" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconCamera = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

export const IconUser = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
  </svg>
);

export const IconMenu = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const IconArrowRight = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 12h16m-6-6 6 6-6 6" />
  </svg>
);

export const IconFlag = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 21V4m0 1h13l-2.5 4L18 13H5" />
  </svg>
);

export const IconRuble = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 20v-4m0 0V4h5a4 4 0 0 1 0 8H9m0 4H7m2 0h6M7 12h2" />
  </svg>
);

export const IconClock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconHandshake = (p: P) => (
  <svg {...base(p)}>
    <path d="m11 17 2 1.8a1.6 1.6 0 0 0 2.2-2.3" />
    <path d="m14 15.5 1.6 1.5a1.6 1.6 0 0 0 2.3-2.2L13 10.3a3 3 0 0 0-4 0l-.9.8a2 2 0 0 1-2.8-2.8L8.6 5A6 6 0 0 1 15 3.7l4 1.8" />
    <path d="M2 5h3v9H2M22 5h-3v9h3" />
  </svg>
);

export const IconVk = (p: P) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M13.1 17.9C7 17.9 3.3 13.6 3.2 6.5h3.1c.1 5.2 2.5 7.5 4.3 7.9V6.5h3v4.5c1.8-.2 3.7-2.3 4.3-4.5H21c-.5 2.8-2.5 4.9-3.9 5.7 1.4.7 3.7 2.5 4.5 5.7h-3.3c-.7-2.2-2.3-3.9-4.5-4.1v4.1h-.7Z" />
  </svg>
);

/* Иконки категорий — плейсхолдеры до передачи брендовых иконок заказчиком */
export const IconDrill = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 8h11a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-3l1.5 5.5a1 1 0 0 1-1 1.5H9l-1.5-7H3V8Z" />
    <path d="M16 9.5h3.5a1.5 1.5 0 0 1 0 3H16M3 8V6.5h6V8" />
  </svg>
);

export const IconMixer = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 13 4-8 8 3-2 7a5 5 0 0 1-9.6-1L6 13Z" />
    <path d="M4 21l3.5-5M17 21l-3-4.5" />
  </svg>
);

export const IconLeaf = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 19C5 9 11 4 20 4c0 9-5 15-13 15" />
    <path d="M4 20c3-5 7-8 11-10" />
  </svg>
);

export const IconSpray = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 9h7l-1 12H9L8 9ZM10 9V6h3v3M13 6V4h4M19 4h.01M19 7h.01M21 5.5h.01" />
  </svg>
);

export const IconLevel = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="9" width="18" height="6" rx="1" />
    <circle cx="12" cy="12" r="1.6" />
    <path d="M6 9v6M18 9v6" />
  </svg>
);

export const IconBox = (p: P) => (
  <svg {...base(p)}>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </svg>
);

/** Слаги категорий, для которых есть фирменные иконки заказчика. */
const BRAND_CATEGORY_ICONS = new Set([
  "elektroinstrument",
  "stroitelnaya-tekhnika",
  "sadovaya-tekhnika",
  "klining-tekhnika",
  "izmeritelnoe-oborudovanie",
  "prochee",
]);

/**
 * Иконка категории — фирменные PNG заказчика (public/brand/categories/).
 * Стиль «неон на тёмном» — размещать на тёмных плитках (bg-ink-900).
 * Для новых категорий без своей иконки используется «Прочее».
 */
export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const file = BRAND_CATEGORY_ICONS.has(slug) ? slug : "prochee";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brand/categories/${file}.png`}
      alt=""
      loading="lazy"
      className={`${className ?? "h-6 w-6"} object-contain`}
    />
  );
}
