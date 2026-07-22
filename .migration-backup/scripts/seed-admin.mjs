/**
 * One-time admin seeding script.
 * Creates the admin account only if it does not already exist.
 * Run with: NEON_DATABASE_URL=<url> node scripts/seed-admin.mjs
 */
import pg from "pg";
import bcrypt from "bcryptjs";

const { Client } = pg;

const DATABASE_URL = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("NEON_DATABASE_URL (or DATABASE_URL) must be set");

const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: existing } = await client.query(
  "SELECT id FROM users WHERE username = $1 LIMIT 1",
  ["mohghaith"]
);

if (existing.length > 0) {
  console.log("Admin already exists — skipping. Use the app to change the password.");
} else {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) throw new Error("ADMIN_PASSWORD env var must be set when seeding a new admin");

  const hash = await bcrypt.hash(adminPassword, 10);
  await client.query(
    `INSERT INTO users (id, name, username, phone, role, status, password_hash, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())`,
    ["أحمد الغيث", "mohghaith", "0501234567", "admin", "active", hash]
  );
  console.log("Admin created successfully.");
}

await client.end();
