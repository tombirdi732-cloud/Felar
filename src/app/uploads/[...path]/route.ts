import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { UPLOADS_DIR } from "@/lib/uploads";
import { getCurrentUser } from "@/lib/auth";

/**
 * Раздача загруженных пользователями фото.
 * Каталог uploads/docs (документы для верификации) доступен только
 * администратору — наружу такие файлы не отдаются.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await params;
  if (parts[0] === "docs") {
    const user = await getCurrentUser();
    if (user?.role !== "ADMIN") {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }
  const full = path.join(UPLOADS_DIR, ...parts);
  if (!full.startsWith(UPLOADS_DIR) || !full.endsWith(".webp")) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const data = await readFile(full);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
