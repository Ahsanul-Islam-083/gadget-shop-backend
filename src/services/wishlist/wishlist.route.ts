import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "@/middleware/auth";
import { sendSuccess } from "@/lib/response";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  toggleWishlist,
} from "./wishlist.service";

const router = Router();

/**
 * All wishlist routes require authentication and operate on the
 * authenticated user's own wishlist only.
 */
router.use(authenticate);

/**
 * GET /wishlist
 *
 * Get the current user's wishlist with product details.
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wishlist = await getWishlist(req.user!.id);

    sendSuccess(res, wishlist, "Wishlist fetched successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * POST /wishlist/toggle
 *
 * Add the product if absent, remove it if present.
 * Expected Request Body:
 * {
 *   "productId": "<uuid>"
 * }
 *
 * Returns: { inWishlist: boolean } (+ item when added).
 */
router.post("/toggle", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "productId is required",
      });
    }

    const result = await toggleWishlist(req.user!.id, productId);

    sendSuccess(
      res,
      result,
      result.inWishlist ? "Added to wishlist" : "Removed from wishlist"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * POST /wishlist
 *
 * Add a product to the wishlist (idempotent).
 * Expected Request Body:
 * {
 *   "productId": "<uuid>"
 * }
 *
 * Returns: { item, added: boolean } (added=false if already present).
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "productId is required",
      });
    }

    const result = await addToWishlist(req.user!.id, productId);

    sendSuccess(
      res,
      result,
      result.added ? "Added to wishlist" : "Already in wishlist",
      result.added ? 201 : 200
    );
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /wishlist/:id
 *
 * Remove a single wishlist item.
 */
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const result = await removeFromWishlist(req.user!.id, id);

    sendSuccess(res, result, "Wishlist item removed successfully");
  } catch (error) {
    next(error);
  }
});

export default router;