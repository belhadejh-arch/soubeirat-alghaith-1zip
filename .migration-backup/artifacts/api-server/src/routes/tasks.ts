import { Router } from "express";
import { db, tasksTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (_req, res) => {
  const rows = await db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt));
  res.json(rows);
});

router.post("/", async (req, res) => {
  try {
    const [row] = await db.insert(tasksTable).values(req.body).returning();
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const { status, postponeReason } = req.body as { status: string; postponeReason?: string };
    await db.update(tasksTable)
      .set({ status, postponeReason: postponeReason ?? null })
      .where(eq(tasksTable.id, req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

router.delete("/:id", async (req, res) => {
  await db.delete(tasksTable).where(eq(tasksTable.id, req.params.id));
  res.json({ ok: true });
});

export default router;
