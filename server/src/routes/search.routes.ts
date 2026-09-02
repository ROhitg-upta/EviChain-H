import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware";

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// GET /search — Quick global search (Command Palette)
// ═══════════════════════════════════════════════════════════════════
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
        where: {
          OR: [
            { name:   { contains: q, mode: "insensitive" } },
            { sha256: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id:     true,
          name:   true,
          sha256: true,
          case:   { select: { title: true } },
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

// ═══════════════════════════════════════════════════════════════════
// GET /search/advanced — Multi-field search with relevance ranking
// ═══════════════════════════════════════════════════════════════════
router.get("/advanced", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const caseId = req.query.caseId as string | undefined;
    const ownerOrg = req.query.ownerOrg as string | undefined;
    const uploaderId = req.query.uploaderId as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const where: Record<string, unknown> = {};

    if (q) {
      where.OR = [
        { name:     { contains: q, mode: "insensitive" } },
        { sha256:   { contains: q, mode: "insensitive" } },
        { ownerOrg: { contains: q, mode: "insensitive" } },
      ];
    }

    if (type) where.type = type;
    if (status) where.status = status;
    if (caseId) where.caseId = caseId;
    if (ownerOrg) where.ownerOrg = { contains: ownerOrg, mode: "insensitive" };
    if (uploaderId) where.collectedById = uploaderId;

    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) dateFilter.lte = new Date(endDate);
      where.createdAt = dateFilter;
    }

    const items = await prisma.evidence.findMany({
      where,
      include: {
        case: { select: { id: true, title: true, status: true } },
        collectedBy: { select: { id: true, name: true, role: true } },
        custodyEvents: { orderBy: { timestamp: "desc" }, take: 1 },
      },
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    // Score & rank results if search query provided
    const rankedResults = items.map((item) => {
      let score = 1.0;
      if (q) {
        const lowerQ = q.toLowerCase();
        if (item.sha256.toLowerCase() === lowerQ) score += 10.0;
        else if (item.sha256.toLowerCase().includes(lowerQ)) score += 5.0;
        
        if (item.name.toLowerCase() === lowerQ) score += 8.0;
        else if (item.name.toLowerCase().startsWith(lowerQ)) score += 4.0;
        else if (item.name.toLowerCase().includes(lowerQ)) score += 2.0;

        if (item.ownerOrg.toLowerCase().includes(lowerQ)) score += 1.5;
      }
      return { ...item, relevanceScore: score };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);

    return res.json({
      query: q,
      totalMatches: rankedResults.length,
      results: rankedResults,
    });
  } catch (error) {
    console.error("Advanced search error:", error);
    return res.status(500).json({ error: "Advanced search failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /search/presets — List user saved presets
// ═══════════════════════════════════════════════════════════════════
router.get("/presets", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const presets = await prisma.searchPreset.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "desc" },
    });
    return res.json(presets);
  } catch (error) {
    console.error("Get presets error:", error);
    return res.status(500).json({ error: "Failed to fetch search presets" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /search/presets — Save a search filter preset
// ═══════════════════════════════════════════════════════════════════
router.post("/presets", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { name, filters } = req.body as { name: string; filters: Record<string, unknown> };

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Preset name is required" });
    }

    const preset = await prisma.searchPreset.create({
      data: {
        userId: req.userId!,
        name,
        filters: (filters || {}) as object,
      },
    });

    return res.status(201).json(preset);
  } catch (error) {
    console.error("Save preset error:", error);
    return res.status(500).json({ error: "Failed to save search preset" });
  }
});

// ═══════════════════════════════════════════════════════════════════
// DELETE /search/presets/:id — Delete a saved preset
// ═══════════════════════════════════════════════════════════════════
router.delete("/presets/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const id = req.params["id"] as string;

    const preset = await prisma.searchPreset.findUnique({ where: { id } });
    if (!preset || preset.userId !== req.userId!) {
      return res.status(404).json({ error: "Preset not found" });
    }

    await prisma.searchPreset.delete({ where: { id } });
    return res.json({ message: "Preset deleted successfully" });
  } catch (error) {
    console.error("Delete preset error:", error);
    return res.status(500).json({ error: "Failed to delete preset" });
  }
});

export default router;
