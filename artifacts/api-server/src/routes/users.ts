import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authMiddleware, adminOnly } from "../middlewares/auth.js";

const router = Router();
router.use(authMiddleware);

// GET /api/users
router.get("/", async (_req, res) => {
  try {
    const rows = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      username: usersTable.username,
      phone: usersTable.phone,
      role: usersTable.role,
      status: usersTable.status,
      createdAt: usersTable.createdAt,
    }).from(usersTable).orderBy(usersTable.createdAt);
    res.json(rows);
  } catch (err) {
    console.error("Get users error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/users  (admin only)
router.post("/", adminOnly, async (req, res) => {
  try {
    const { name, username, phone, role, password } = req.body as {
      name: string; username: string; phone?: string; role: string; password: string;
    };
    if (!name || !username || !password) {
      res.status(400).json({ error: "missing_fields" }); return;
    }

    const [existing] = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.username, username.trim().toLowerCase())).limit(1);
    if (existing) { res.status(409).json({ error: "username_taken" }); return; }

    const hash = await bcrypt.hash(password, 10);
    const [created] = await db.insert(usersTable).values({
      name: name.trim(),
      username: username.trim().toLowerCase(),
      phone: phone?.trim() ?? "",
      role,
      status: "active",
      passwordHash: hash,
    }).returning({
      id: usersTable.id, name: usersTable.name, username: usersTable.username,
      phone: usersTable.phone, role: usersTable.role, status: usersTable.status,
      createdAt: usersTable.createdAt,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// PATCH /api/users/:id
router.patch("/:id", adminOnly, async (req, res) => {
  try {
    const { status, password } = req.body as { status?: string; password?: string };
    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (password) updates.passwordHash = await bcrypt.hash(password, 10);
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "nothing_to_update" }); return;
    }
    await db.update(usersTable).set(updates).where(eq(usersTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/users/:id
router.delete("/:id", adminOnly, async (req, res) => {
  try {
    await db.delete(usersTable).where(eq(usersTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
