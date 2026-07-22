import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (native mobile apps, curl, server-to-server)
      if (!origin) return cb(null, true);

      // Allow all Replit preview / deploy domains
      if (origin.endsWith(".replit.dev") || origin.endsWith(".replit.app")) {
        return cb(null, true);
      }

      // Allow all Vercel preview / production domains
      if (origin.endsWith(".vercel.app")) {
        return cb(null, true);
      }

      // Wildcard: allow everything (useful for local dev when ALLOWED_ORIGINS=*)
      if (allowedOrigins.includes("*")) {
        return cb(null, true);
      }

      // Allow any explicitly listed origin
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }

      cb(new Error(`CORS: ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
