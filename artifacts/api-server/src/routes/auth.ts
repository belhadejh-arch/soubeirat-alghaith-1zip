import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username.trim().toLowerCase()))
      .limit(1);

    if (!user) { res.status(401).json({ error: "not_found" }); return; }
    if (user.status === "suspended") { res.status(403).json({ error: "suspended" }); return; }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) { res.status(401).json({ error: "wrong_password" }); return; }

    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET!;
    const token = jwt.sign(
      { id: user.id, role: user.role },
      secret,
      { expiresIn: "30d" },
    );

    const { passwordHash: _, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/auth/seed  — creates admin if table is empty
router.post("/seed", async (_req, res) => {
  try {
    const existing = await db.select().from(usersTable).limit(1);
    if (existing.length > 0) {
      res.json({ message: "already_seeded" });
      return;
    }
    const hash = await bcrypt.hash("admin123", 10);
    await db.insert(usersTable).values({
      name: "المدير",
      username: "admin",
      phone: "",
      role: "admin",
      status: "active",
      passwordHash: hash,
    });
    res.json({ message: "seeded" });
  } catch (err) {
    console.error("Seed error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
