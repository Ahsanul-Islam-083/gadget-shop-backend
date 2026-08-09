import { Router, Request, Response, NextFunction } from "express";
import { UserRole } from "@/generated/prisma/client";
import { authenticate } from "@/middleware/auth";
import { requireRole } from "@/middleware/authorize";
import { sendSuccess, sendPaginated } from "@/lib/response";
import {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} from "./user.service";

const router = Router();

// All user management endpoints are ADMIN only
router.use(authenticate, requireRole(UserRole.ADMIN));

/**
 * POST /users
 *
 * Create a user (admin only).
 * Expected Request Body:
 * {
 *   "name": "Jane Doe",
 *   "email": "jane@example.com",
 *   "password": "secret123",
 *   "role": "ADMIN" | "CUSTOMER"  // optional, defaults to CUSTOMER
 * }
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    const user = await createUser({ name, email, password, role });

    sendSuccess(res, user, "User created successfully", 201);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users
 *
 * List users with optional filter, search, and pagination.
 *
 * Query Parameters:
 * - includeDeleted: boolean (default: false)
 * - search: name or email substring (optional)
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

    const result = await listUsers({ includeDeleted, search, page, pageSize });

    sendPaginated(res, result.data, result.pagination, "Users fetched successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:id
 *
 * Get a single user's details (password never returned).
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const user = await getUserById(id);

    sendSuccess(res, user, "User fetched successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/users/:id
 *
 * Update user info (admin only).
 * All fields optional:
 * { "name": "...", "email": "...", "password": "...", "role": "ADMIN" }
 * - set "isDeleted": true/false to soft-delete or RESTORE a user
 */
router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const user = await updateUser(id, req.body);

    sendSuccess(res, user, "User updated successfully");
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/users/:id
 *
 * Soft delete by default; pass ?permanent=true to remove from DB.
 * Admins cannot delete or soft-delete their own account.
 */
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const permanent = req.query.permanent === "true";

    if (req.user!.id === id) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account",
      });
    }

    const result = await deleteUser(id, permanent);

    sendSuccess(
      res,
      result,
      permanent ? "User permanently deleted" : "User deleted successfully"
    );
  } catch (error) {
    next(error);
  }
});

export default router;