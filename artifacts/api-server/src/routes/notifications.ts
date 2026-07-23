import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

// GET /api/notifications
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(notificationsTable)
      .orderBy(notificationsTable.createdAt);
    res.json(rows);
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/notifications
router.post("/", async (req, res) => {
  try {
    const { message, type, date, time } = req.body as {
      message: string;
      type: string;
      date: string;
      time: string;
    };
    if (!message || !type || !date || !time) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const [created] = await db
      .insert(notificationsTable)
      .values({ message, type, date, time })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("Create notification error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", async (req, res) => {
  try {
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(eq(notificationsTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Mark notification read error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/notifications/read-all
router.post("/read-all", async (_req, res) => {
  try {
    await db.update(notificationsTable).set({ isRead: true });
    res.json({ ok: true });
  } catch (err) {
    console.error("Mark all notifications read error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
