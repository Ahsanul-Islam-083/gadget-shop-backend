import { Router, Request, Response, NextFunction } from "express";
import { UserRole } from "@/generated/prisma/client";
import { authenticate } from "@/middleware/auth";
import { requireRole } from "@/middleware/authorize";
import { sendSuccess, sendPaginated } from "@/lib/response";
import {
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from "./category.service";

const router = Router();

/**
 * GET /categories
 *
 * List categories (public).
 *
 * Query Parameters:
 * - includeDeleted: boolean (default: false, admin use)
 * - search: name substring (optional)
 * - page: default 1
 * - pageSize: default 10, max 100
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeDeleted = req.query.includeDeleted === "true";
    const search = req.query.search as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(
      100,
      parseInt(req.query.pageSize as string) || 10
    );

    const result = await listCategories({
      includeDeleted,
      search,
      page,
      pageSize,
    });

    sendPaginated(res, result.data, result.pagination, "Categories fetched successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * GET /categories/:id
 *
 * Get a single category (public). Soft-deleted categories return 404.
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const category = await getCategoryById(id);

    sendSuccess(res, category, "Category fetched successfully");
  } catch (error) {
    next(error);
  }
});

// All write endpoints below are ADMIN only
router.use(authenticate, requireRole(UserRole.ADMIN));

/**
 * POST /categories
 *
 * Create a category (admin only).
 * Expected Request Body:
 * {
 *   "name": "Smartphones"
 * }
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    const category = await createCategory({ name });

    sendSuccess(res, category, "Category created successfully", 201);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /categories/:id
 *
 * Update a category (admin only).
 * All fields optional:
 * { "name": "..." }
 * - set "isDeleted": true/false to soft-delete or RESTORE a category
 */
router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const category = await updateCategory(id, req.body);

    sendSuccess(res, category, "Category updated successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /categories/:id
 *
 * Soft delete by default; pass ?permanent=true to remove from DB.
 * Permanent delete is blocked if the category has products.
 */
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const permanent = req.query.permanent === "true";

    const result = await deleteCategory(id, permanent);

    sendSuccess(
      res,
      result,
      permanent ? "Category permanently deleted" : "Category deleted successfully"
    );
  } catch (error) {
    next(error);
  }
});

export default router;