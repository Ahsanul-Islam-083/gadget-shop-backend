import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "@/middleware/auth";
import { sendSuccess } from "@/lib/response";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} from "./cart.service";

const router = Router();

/**
 * All cart routes require authentication and operate on the
 * authenticated user's own cart only.
 */
router.use(authenticate);

/**
 * GET /cart-items
 *
 * Get the current user's cart with product details and totals.
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cart = await getCart(req.user!.id);

    sendSuccess(res, cart, "Cart fetched successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * POST /cart-items
 *
 * Add a product to the cart (or increase quantity if already present).
 * Expected Request Body:
 * {
 *   "productId": "<uuid>",
 *   "quantity": 2  // optional, defaults to 1
 * }
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, quantity } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "productId is required",
      });
    }

    const item = await addToCart(req.user!.id, { productId, quantity });

    sendSuccess(res, item, "Added to cart successfully", 201);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /cart-items/:id
 *
 * Set the quantity of a cart item (positive integer).
 * Expected Request Body:
 * {
 *   "quantity": 3
 * }
 */
router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const item = await updateCartItem(req.user!.id, id, req.body);

    sendSuccess(res, item, "Cart item updated successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /cart-items/clear
 *
 * Remove every cart item for the current user.
 */
router.delete("/clear", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await clearCart(req.user!.id);

    sendSuccess(res, result, "Cart cleared successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /cart-items/:id
 *
 * Remove a single cart item.
 */
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const result = await removeCartItem(req.user!.id, id);

    sendSuccess(res, result, "Cart item removed successfully");
  } catch (error) {
    next(error);
  }
});

export default router;