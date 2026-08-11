import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { registerUser, loginUser, getMe, updateMe, getGoogleAuthUrl, loginWithGoogle } from "./auth.service";
import { sendSuccess } from "@/lib/response";
import { authenticate } from "@/middleware/auth";
import { AppError } from "@/lib/error-handler";

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

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
 * GET /auth/google
 *
 * Redirect the browser to Google's OAuth consent screen.
 * Not a JSON API call — use it as a link in the login page.
 */
router.get("/google", (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie("oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(getGoogleAuthUrl(state));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auth/google/callback
 *
 * Google redirects here after consent. Exchanges the code for the user's
 * profile, finds-or-creates the User (role CUSTOMER, password null), issues
 * the same JWT as register/login, then redirects to:
 *   <FRONTEND_URL>/auth/callback?token=<jwt>
 * On failure it redirects with an error param: /auth/callback?error=<message>
 */
router.get("/google/callback", async (req: Request, res: Response) => {
  try {
    const receivedState = typeof req.query.state === "string" ? req.query.state : undefined;
    const cookieState = (req.cookies as Record<string, string> | undefined)?.oauth_state;
    res.clearCookie("oauth_state");

    if (!receivedState || !cookieState || receivedState !== cookieState) {
      throw new AppError("Invalid OAuth state", 400);
    }

    const code = typeof req.query.code === "string" ? req.query.code : undefined;

    // User denied consent or Google reported an error.
    if (!code) {
      const error = typeof req.query.error === "string" ? req.query.error : "Google authentication failed";
      return res.redirect(`${FRONTEND_URL}/auth/callback?error=${encodeURIComponent(error)}`);
    }

    const { token } = await loginWithGoogle(code);

    res.redirect(`${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`);
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Google authentication failed";
    res.redirect(`${FRONTEND_URL}/auth/callback?error=${encodeURIComponent(message)}`);
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

/**
 * PATCH /auth/me
 *
 * Self-edit profile for currently authenticated user.
 * Allows updating name, image, and password (requires currentPassword).
 * Header: Authorization: Bearer <token>
 * Request Body:
 * {
 *   "name": "Jane Doe",                   // optional
 *   "image": "https://example.com/a.jpg", // optional, string or null
 *   "password": "newSecret123",           // optional (requires currentPassword)
 *   "currentPassword": "oldSecret123"     // required only if password is provided
 * }
 */
router.patch("/me", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, image, password, currentPassword } = req.body;

    const user = await updateMe(req.user!.id, {
      name,
      image,
      password,
      currentPassword,
    });

    sendSuccess(res, user, "Profile updated successfully");
  } catch (error) {
    next(error);
  }
});

export default router;