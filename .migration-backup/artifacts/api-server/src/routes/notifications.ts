import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (_req, res) => {
  const rows = await db.select().from(notificationsTable).orderBy(desc(notificationsTable.createdAt));
  res.json(rows);
});

router.post("/", async (req, res) => {
  try {
    const [row] = await db.insert(notificationsTable).values(req.body).returning();
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

router.patch("/:id/read", async (req, res) => {
  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, req.params.id));
  res.json({ ok: true });
});

router.post("/read-all", async (_req, res) => {
  await db.update(notificationsTable).set({ isRead: true });
  res.json({ ok: true });
});

export default router;
