import { Router } from "express";
import { db, tasksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

// GET /api/tasks
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(tasksTable)
      .orderBy(tasksTable.createdAt);
    res.json(rows);
  } catch (err) {
    console.error("Get tasks error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/tasks
router.post("/", async (req, res) => {
  try {
    const {
      title,
      description,
      workerId,
      workerName,
      date,
      time,
      priority,
      createdById,
      createdByName,
    } = req.body as {
      title: string;
      description?: string;
      workerId?: string;
      workerName: string;
      date: string;
      time: string;
      priority?: string;
      createdById?: string;
      createdByName: string;
    };
    if (!title || !workerName || !date || !time || !createdByName) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const [created] = await db
      .insert(tasksTable)
      .values({
        title,
        description: description ?? "",
        workerId: workerId ?? null,
        workerName,
        date,
        time,
        priority: priority ?? "medium",
        createdById: createdById ?? null,
        createdByName,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("Create task error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// PATCH /api/tasks/:id/status
router.patch("/:id/status", async (req, res) => {
  try {
    const { status, postponeReason } = req.body as {
      status: string;
      postponeReason?: string;
    };
    await db
      .update(tasksTable)
      .set({ status, postponeReason: postponeReason ?? null })
      .where(eq(tasksTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Update task status error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/tasks/:id
router.delete("/:id", async (req, res) => {
  try {
    await db.delete(tasksTable).where(eq(tasksTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete task error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
