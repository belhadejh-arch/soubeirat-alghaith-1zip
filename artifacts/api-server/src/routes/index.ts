import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import productsRouter from "./products.js";
import expensesRouter from "./expenses.js";
import suppliersRouter from "./suppliers.js";
import ordersRouter from "./orders.js";
import tasksRouter from "./tasks.js";
import customersRouter from "./customers.js";
import notificationsRouter from "./notifications.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/products", productsRouter);
router.use("/expenses", expensesRouter);
router.use("/suppliers", suppliersRouter);
router.use("/orders", ordersRouter);
router.use("/tasks", tasksRouter);
router.use("/customers", customersRouter);
router.use("/notifications", notificationsRouter);

export default router;
