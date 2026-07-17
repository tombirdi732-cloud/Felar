import { prisma } from "./db";

/**
 * Рейтинг пользователя — строго среднее по реальным (не скрытым) отзывам
 * (ТЗ п. 9: без ручной корректировки и бонусных баллов).
 */
export async function getUserRating(userId: string): Promise<{ avg: number | null; count: number }> {
  const agg = await prisma.review.aggregate({
    where: { targetId: userId, hidden: false },
    _avg: { rating: true },
    _count: true,
  });
  return {
    avg: agg._count > 0 ? Math.round((agg._avg.rating ?? 0) * 10) / 10 : null,
    count: agg._count,
  };
}

export async function getRatingsForUsers(userIds: string[]): Promise<Map<string, { avg: number; count: number }>> {
  const rows = await prisma.review.groupBy({
    by: ["targetId"],
    where: { targetId: { in: userIds }, hidden: false },
    _avg: { rating: true },
    _count: true,
  });
  return new Map(
    rows.map((r) => [
      r.targetId,
      { avg: Math.round((r._avg.rating ?? 0) * 10) / 10, count: r._count },
    ])
  );
}
