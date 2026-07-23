import { Router } from "express";
import { db, purchaseOrdersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

// Generate order number: ORD-YYYYMMDD-NNNN
async function generateOrderNumber(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await db.$count(purchaseOrdersTable);
  return `ORD-${today}-${String(count + 1).padStart(4, "0")}`;
}

// GET /api/orders
router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(purchaseOrdersTable)
      .orderBy(desc(purchaseOrdersTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("Get orders error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/orders
router.post("/", async (req, res) => {
  try {
    const { supplierId, supplierName, supplierPhone, items, date, notes } =
      req.body as {
        supplierId?: string;
        supplierName: string;
        supplierPhone?: string;
        items: unknown;
        date: string;
        notes?: string;
      };
    if (!supplierName || !date) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }
    const orderNumber = await generateOrderNumber();
    const [created] = await db
      .insert(purchaseOrdersTable)
      .values({
        orderNumber,
        supplierId: supplierId ?? null,
        supplierName,
        supplierPhone: supplierPhone ?? "",
        items: items ?? [],
        date,
        notes: notes ?? "",
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// PATCH /api/orders/:id/status
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body as { status: string };
    await db
      .update(purchaseOrdersTable)
      .set({ status })
      .where(eq(purchaseOrdersTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Update order status error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/orders/:id
router.delete("/:id", async (req, res) => {
  try {
    await db
      .delete(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete order error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
