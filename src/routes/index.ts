import { Router } from "express";
import auth from "@/services/auth/auth.route";
import users from "@/services/user/user.route";
import categories from "@/services/category/category.route";
import products from "@/services/product/product.route";
import reviews from "@/services/review/review.route";
import cart from "@/services/cart/cart.route";
import wishlist from "@/services/wishlist/wishlist.route";
import orders from "@/services/order/order.route";

const router = Router();

/**
 * ============================================
 * MAIN API ROUTER - Route Registration
 * ============================================
 */

router.use("/auth", auth);
router.use("/users", users);
router.use("/categories", categories);
router.use("/products", products);
router.use("/reviews", reviews);
router.use("/cart-items", cart);
router.use("/wishlist", wishlist);
router.use("/orders", orders);

export default router;