import { Router } from "express";
import { db, missingProductsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (_req, res) => {
  const rows = await db.select().from(missingProductsTable).orderBy(desc(missingProductsTable.createdAt));
  res.json(rows);
});

router.post("/", async (req, res) => {
  try {
    const [row] = await db.insert(missingProductsTable).values(req.body).returning();
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const { status, updatedBy, updatedAt } = req.body as { status: string; updatedBy: string; updatedAt: string };
    await db.update(missingProductsTable)
      .set({ status, updatedBy, updatedAt })
      .where(eq(missingProductsTable.id, req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

router.delete("/:id", async (req, res) => {
  await db.delete(missingProductsTable).where(eq(missingProductsTable.id, req.params.id));
  res.json({ ok: true });
});

export default router;
