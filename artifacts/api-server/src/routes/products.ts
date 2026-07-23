import { Router } from "express";
import { db, missingProductsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

// GET /api/products
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(missingProductsTable)
      .orderBy(missingProductsTable.createdAt);
    res.json(rows);
  } catch (err) {
    console.error("Get products error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/products
router.post("/", async (req, res) => {
  try {
    const { name, quantity, section, workerId, workerName, date, time } =
      req.body as {
        name: string;
        quantity: string;
        section: string;
        workerId?: string;
        workerName: string;
        date: string;
        time: string;
      };
    if (!name || !quantity || !section || !workerName || !date || !time) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const [created] = await db
      .insert(missingProductsTable)
      .values({ name, quantity, section, workerId: workerId ?? null, workerName, date, time })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// PATCH /api/products/:id/status
router.patch("/:id/status", async (req, res) => {
  try {
    const { status, updatedBy, updatedAt } = req.body as {
      status: string;
      updatedBy: string;
      updatedAt: string;
    };
    await db
      .update(missingProductsTable)
      .set({ status, updatedBy, updatedAt })
      .where(eq(missingProductsTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Update product status error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/products/:id
router.delete("/:id", async (req, res) => {
  try {
    await db
      .delete(missingProductsTable)
      .where(eq(missingProductsTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete product error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
