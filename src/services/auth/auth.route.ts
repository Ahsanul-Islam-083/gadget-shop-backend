import { Router, Request, Response, NextFunction } from "express";
import { registerUser, loginUser, getMe } from "./auth.service";
import { sendSuccess } from "@/lib/response";
import { authenticate } from "@/middleware/auth";

const router = Router();

/**
 * POST /auth/register
 *
 * Create a new customer account.
 * Expected Request Body:
 * {
 *   "name": "John Doe",
 *   "email": "john@example.com",
 *   "password": "secret123"
 * }
 *
 * Returns: { user, token } — token is the Bearer JWT for subsequent requests.
 * NOTE: Role is always CUSTOMER on registration (no privilege escalation).
 */
router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    const result = await registerUser({ name, email, password });

    sendSuccess(res, result, "User registered successfully", 201);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auth/login
 *
 * Authenticate an existing user.
 * Expected Request Body:
 * {
 *   "email": "john@example.com",
 *   "password": "secret123"
 * }
 *
 * Returns: { success, message, data: { user, token } }
 */
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const result = await loginUser({ email, password });

    sendSuccess(res, result, "Login successful");
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auth/me
 *
 * Get the currently authenticated user's profile.
 * Header: Authorization: Bearer <token>
 */
router.get("/me", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await getMe(req.user!.id);

    sendSuccess(res, user, "User fetched successfully");
  } catch (error) {
    next(error);
  }
});

export default router;