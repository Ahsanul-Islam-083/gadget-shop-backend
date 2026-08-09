import { Router, Request, Response, NextFunction } from "express";
import { UserRole } from "@/generated/prisma/client";
import { authenticate } from "@/middleware/auth";
import { requireRole } from "@/middleware/authorize";
import { sendSuccess, sendPaginated } from "@/lib/response";
import {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from "./product.service";

const router = Router();

/**
 * GET /products
 *
 * List products (public) with filters and pagination.
 *
 * Query Parameters:
 * - includeDeleted: boolean (default: false, admin use)
 * - search: title or brand substring (optional)
 * - categoryId: exact category filter (optional)
 * - minPrice / maxPrice: price range (optional)
 * - sortBy: "newest" (default) | "price" | "rating"
 * - order: "asc" | "desc" (default: desc for newest, asc for price/rating)
 * - page: default 1
 * - pageSize: default 10, max 100
 *
 * Each row includes avgRating/ratingCount computed from reviews.
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeDeleted = req.query.includeDeleted === "true";
    const search = req.query.search as string | undefined;
    const categoryId = req.query.categoryId as string | undefined;
    const minPrice = req.query.minPrice as string | undefined;
    const maxPrice = req.query.maxPrice as string | undefined;
    const sortBy = req.query.sortBy as string | undefined;
    const order = req.query.order as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(
      100,
      parseInt(req.query.pageSize as string) || 10
    );

    const result = await listProducts({
      includeDeleted,
      search,
      categoryId,
      minPrice,
      maxPrice,
      sortBy,
      order,
      page,
      pageSize,
    });

    sendPaginated(res, result.data, result.pagination, "Products fetched successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * GET /products/:id
 *
 * Get a single product (public). Soft-deleted products return 404.
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const product = await getProductById(id);

    sendSuccess(res, product, "Product fetched successfully");
  } catch (error) {
    next(error);
  }
});

// All write endpoints below are ADMIN only
router.use(authenticate, requireRole(UserRole.ADMIN));

/**
 * POST /products
 *
 * Create a product (admin only).
 * Expected Request Body:
 * {
 *   "title": "Wireless Mouse",
 *   "brand": "Logitech",
 *   "description": "...",
 *   "price": 49.99,
 *   "stock": 25,
 *   "image": "https://...",
 *   "categoryId": "<uuid>"
 * }
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, brand, description, price, stock, image, categoryId } =
      req.body;

    if (!title || categoryId === undefined || price === undefined) {
      return res.status(400).json({
        success: false,
        message: "title, price, and categoryId are required",
      });
    }

    const product = await createProduct({
      title,
      brand,
      description,
      price,
      stock,
      image,
      categoryId,
    });

    sendSuccess(res, product, "Product created successfully", 201);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /products/:id
 *
 * Update a product (admin only).
 * All fields optional:
 * { "title": "...", "brand": "...", "description": "...",
 *   "price": 59.99, "stock": 10, "image": "...", "categoryId": "..." }
 * - set "isDeleted": true/false to soft-delete or RESTORE a product
 */
router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const product = await updateProduct(id, req.body);

    sendSuccess(res, product, "Product updated successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /products/:id
 *
 * Soft delete by default; pass ?permanent=true to remove from DB.
 * Permanent delete is blocked if the product appears in past orders.
 */
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const permanent = req.query.permanent === "true";

    const result = await deleteProduct(id, permanent);

    sendSuccess(
      res,
      result,
      permanent ? "Product permanently deleted" : "Product deleted successfully"
    );
  } catch (error) {
    next(error);
  }
});

export default router;