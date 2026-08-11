import prisma from "@/lib/prisma";
import { AppError } from "@/lib/error-handler";
import { hashPassword, comparePassword } from "@/lib/password";
import { signToken } from "@/lib/jwt";
import { UserRole } from "@/generated/prisma/client";
import { OAuth2Client } from "google-auth-library";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SafeUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};

function issueToken(user: SafeUser) {
  return signToken({ id: user.id, email: user.email, role: user.role });
}

export async function registerUser(data: {
  name: string;
  email: string;
  password: string;
}) {
  const email = data.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError("Email is already registered", 400);
  }

  const hashed = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      name: data.name.trim(),
      email,
      password: hashed,
      role: UserRole.CUSTOMER, // registration can never self-assign ADMIN
    },
    select: userSelect,
  });

  return { user, token: issueToken(user) };
}

export async function loginUser(data: {
  email: string;
  password: string;
}) {
  const email = data.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.isDeleted) {
    throw new AppError("Invalid email or password", 401);
  }

  // Google-authenticated users have no password and cannot sign in with one.
  if (!user.password) {
    throw new AppError("Invalid email or password", 401);
  }

  const valid = await comparePassword(data.password, user.password);
  if (!valid) {
    throw new AppError("Invalid email or password", 401);
  }

  const safeUser: SafeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return { user: safeUser, token: issueToken(safeUser) };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...userSelect,
      isDeleted: true,
    },
  });

  if (!user || user.isDeleted) {
    throw new AppError("User not found", 404);
  }

  return user;
}

// ================================
// GOOGLE OAUTH
// ================================

function getGoogleClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

  if (!clientId || !clientSecret || !callbackUrl) {
    throw new AppError(
      "Google OAuth is not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL)",
      500
    );
  }

  return new OAuth2Client({ clientId, clientSecret, redirectUri: callbackUrl });
}

export function getGoogleAuthUrl(state: string): string {
  const client = getGoogleClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    state,
  });
}

export async function loginWithGoogle(code: string): Promise<{ user: SafeUser; token: string }> {
  const client = getGoogleClient();

  let idToken: string;
  try {
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) {
      throw new Error("No id token returned");
    }
    idToken = tokens.id_token;
  } catch {
    throw new AppError("Google authentication failed", 401);
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw new AppError("Google authentication failed", 401);
  }

  if (!payload?.email) {
    throw new AppError("Google account has no email address", 401);
  }
  if (payload.email_verified !== true) {
    throw new AppError("Google email is not verified", 401);
  }

  const email = payload.email.toLowerCase().trim();
  const name = (payload.name ?? email.split("@")[0] ?? "Google User").trim();

  let user = await prisma.user.findUnique({ where: { email } });

  if (user && user.isDeleted) {
    throw new AppError("This account has been deleted", 401);
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        name,
        email,
        password: null, // Google-authenticated users have no local password
        role: UserRole.CUSTOMER, // OAuth can never create an ADMIN
      },
    });
  }

  const safeUser: SafeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return { user: safeUser, token: issueToken(safeUser) };
}