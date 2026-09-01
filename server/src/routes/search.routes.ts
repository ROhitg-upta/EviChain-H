import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware";

const router = Router();

router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const q = String(req.query.q ?? "").trim();

  if (q.length < 2) {
    return res.json({ cases: [], evidence: [], users: [] });
  }

  try {
    const [cases, evidence, users] = await Promise.all([
      prisma.case.findMany({
        where: {
          OR: [
            { title:       { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, title: true, status: true },
        take: 5,
      }),

      prisma.evidence.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        select: {
          id:   true,
          name: true,
          case: { select: { title: true } },
        },
        take: 5,
      }),

      // Only ADMINISTRATOR gets user results
      req.userRole === "ADMINISTRATOR"
        ? prisma.user.findMany({
            where: {
              OR: [
                { name:  { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            },
            select: { id: true, name: true, email: true },
            take: 5,
          })
        : Promise.resolve([]),
    ]);

    return res.json({ cases, evidence, users });
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({ error: "Search failed" });
  }
});

export default router;
