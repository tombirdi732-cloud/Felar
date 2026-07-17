/**
 * Приём и оптимизация пользовательских фото (ТЗ п. 7: сжатие при загрузке).
 * Файлы хранятся вне public/ (каталог uploads/ в корне проекта) и раздаются
 * через маршрут /uploads/[...path]. В продакшне каталог заменяется на
 * S3-совместимое хранилище — точка замены только этот модуль.
 */
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import sharp from "sharp";

export const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const MAX_SIDE = 1600;
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

export async function saveImage(
  file: File,
  subdir: "listings" | "chat" | "avatars" | "docs"
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Файл не является изображением");
  if (file.size > MAX_INPUT_BYTES) throw new Error("Файл больше 12 МБ");

  const buf = Buffer.from(await file.arrayBuffer());
  const optimized = await sharp(buf, { failOn: "error" })
    .rotate() // учёт EXIF-ориентации с телефонов
    .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const name = `${Date.now()}-${randomBytes(8).toString("hex")}.webp`;
  const dir = path.join(UPLOADS_DIR, subdir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), optimized);
  return `/uploads/${subdir}/${name}`;
}

export async function deleteUpload(url: string): Promise<void> {
  if (!url.startsWith("/uploads/")) return;
  const rel = url.replace("/uploads/", "");
  // защита от выхода за пределы каталога
  const full = path.join(UPLOADS_DIR, rel);
  if (!full.startsWith(UPLOADS_DIR)) return;
  await unlink(full).catch(() => {});
}
