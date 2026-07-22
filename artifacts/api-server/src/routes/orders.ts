import { Router } from "express";
import { db, purchaseOrdersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (_req, res) => {
  const rows = await db.select().from(purchaseOrdersTable).orderBy(desc(purchaseOrdersTable.createdAt));
  res.json(rows);
});

router.post("/", async (req, res) => {
  try {
    const [row] = await db.insert(purchaseOrdersTable).values(req.body).returning();
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body as { status: string };
    await db.update(purchaseOrdersTable).set({ status }).where(eq(purchaseOrdersTable.id, req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
