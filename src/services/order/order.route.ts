import { Router, Request, Response, NextFunction } from "express";
import { UserRole } from "@/generated/prisma/client";
import { authenticate } from "@/middleware/auth";
import { requireRole } from "@/middleware/authorize";
import { sendSuccess, sendPaginated } from "@/lib/response";
import {
  listOrders,
  getOrderById,
  createOrderFromCart,
  updateOrder,
  getAnalytics,
} from "./order.service";

const router = Router();

/**
 * All order routes require authentication.
 */
router.use(authenticate);

/**
 * GET /orders
 *
 * List orders (authenticated).
 * - CUSTOMER: only their own orders.
 * - ADMIN: all orders; pass includeDeleted=true to include soft-deleted.
 *
 * Query Parameters:
 * - includeDeleted: boolean (default: false, admin only)
 * - page: default 1
 * - pageSize: default 10, max 100
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const includeDeleted = req.query.includeDeleted === "true";
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(
      100,
      parseInt(req.query.pageSize as string) || 10
    );

    const result = await listOrders({
      userId: user.id,
      isAdmin: user.role === UserRole.ADMIN,
      includeDeleted,
      page,
      pageSize,
    });

    sendPaginated(res, result.data, result.pagination, "Orders fetched successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * POST /orders
 *
 * Create an order from the current user's cart:
 * 1. Validates every cart item (product available, sufficient stock).
 * 2. Creates the order (PENDING / UNPAID) with totalAmount + item snapshots.
 * 3. Records the initial PENDING status in the status history.
 * 4. Clears the cart.
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await createOrderFromCart(req.user!.id);

    sendSuccess(res, order, "Order created successfully", 201);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /orders/analytics
 *
 * Admin dashboard stats (ADMIN only):
 * - totalRevenue: sum of totalAmount across PAID orders
 * - orderCountByStatus: order totals per OrderStatus value
 * - topSellingProducts: products by total quantity sold
 *
 * Query Parameters:
 * - limit: max top products (default 5, max 50)
 */
router.get(
  "/analytics",
  authenticate,
  requireRole(UserRole.ADMIN),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(
        50,
        parseInt(req.query.limit as string) || 5
      );

      const analytics = await getAnalytics(limit);

      sendSuccess(res, analytics, "Analytics fetched successfully");
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /orders/:id
 *
 * Get a single order with items and full status history (owner or admin).
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const order = await getOrderById(id, req.user!);

    sendSuccess(res, order, "Order fetched successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * All status updates below are ADMIN only.
 */
router.use(requireRole(UserRole.ADMIN));

/**
 * PATCH /orders/:id
 *
 * Update order status and/or payment status (admin only).
 * Expected Request Body (all optional):
 * {
 *   "status": "PROCESSING",
 *   "paymentStatus": "PAID"
 * }
 *
 * Every actual status change is recorded in the status history
 * (changedBy = the admin, changedAt = now).
 */
router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const order = await updateOrder(id, req.user!.id, req.body);

    sendSuccess(res, order, "Order updated successfully");
  } catch (error) {
    next(error);
  }
});

export default router;