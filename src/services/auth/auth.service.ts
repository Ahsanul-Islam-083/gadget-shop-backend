import prisma from "@/lib/prisma";
import { AppError } from "@/lib/error-handler";
import { hashPassword, comparePassword } from "@/lib/password";
import { signToken } from "@/lib/jwt";
import { UserRole } from "@/generated/prisma/client";

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