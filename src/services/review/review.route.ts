import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "@/middleware/auth";
import { sendSuccess, sendPaginated } from "@/lib/response";
import {
  listReviews,
  getReviewById,
  createReview,
  updateReview,
  deleteReview,
} from "./review.service";

const router = Router();

/**
 * All review routes require authentication.
 * CUSTOMER sees/manages only their own reviews; ADMIN sees all.
 */
router.use(authenticate);

/**
 * GET /reviews
 *
 * List reviews (authenticated).
 * - CUSTOMER: only their own reviews.
 * - ADMIN: all reviews; pass includeDeleted=true to include soft-deleted.
 *
 * Query Parameters:
 * - productId: filter by product (optional)
 * - includeDeleted: boolean (default: false, admin only)
 * - page: default 1
 * - pageSize: default 10, max 100
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const isAdmin = user.role === "ADMIN";
    const includeDeleted = req.query.includeDeleted === "true";
    const productId = req.query.productId as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(
      100,
      parseInt(req.query.pageSize as string) || 10
    );

    const result = await listReviews({
      userId: user.id,
      isAdmin,
      includeDeleted,
      productId,
      page,
      pageSize,
    });

    sendPaginated(res, result.data, result.pagination, "Reviews fetched successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * GET /reviews/:id
 *
 * Get a single review (owner or admin).
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const review = await getReviewById(id, req.user!);

    sendSuccess(res, review, "Review fetched successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * POST /reviews
 *
 * Create a review on a product (authenticated).
 * One review per user per product.
 * Expected Request Body:
 * {
 *   "productId": "<uuid>",
 *   "rating": 5,
 *   "comment": "Great gadget!"
 * }
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, rating, comment } = req.body;

    if (!productId || rating === undefined) {
      return res.status(400).json({
        success: false,
        message: "productId and rating are required",
      });
    }

    const review = await createReview({ productId, rating, comment }, req.user!.id);

    sendSuccess(res, review, "Review created successfully", 201);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /reviews/:id
 *
 * Update your own review (owner or admin).
 * All fields optional:
 * { "rating": 4, "comment": "..." }
 * - admins may also set "isDeleted": true/false
 */
router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const review = await updateReview(id, req.body, req.user!);

    sendSuccess(res, review, "Review updated successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /reviews/:id
 *
 * Soft delete by default; pass ?permanent=true to remove from DB.
 * Owner or admin only.
 */
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const permanent = req.query.permanent === "true";

    const result = await deleteReview(id, permanent, req.user!);

    sendSuccess(
      res,
      result,
      permanent ? "Review permanently deleted" : "Review deleted successfully"
    );
  } catch (error) {
    next(error);
  }
});

export default router;