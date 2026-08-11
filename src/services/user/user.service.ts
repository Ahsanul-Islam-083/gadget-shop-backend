import prisma from "@/lib/prisma";
import { AppError } from "@/lib/error-handler";
import { hashPassword } from "@/lib/password";
import { UserRole } from "@/generated/prisma/client";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  image: true,
  createdAt: true,
  updatedAt: true,
} as const;

const userListSelect = {
  ...userSelect,
  isDeleted: true,
} as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  if (!EMAIL_REGEX.test(email)) {
    throw new AppError("Invalid email format", 400);
  }
  return email.toLowerCase().trim();
}

export interface ListUsersParams {
  includeDeleted: boolean;
  search?: string;
  page: number;
  pageSize: number;
}

export async function listUsers({
  includeDeleted,
  search,
  page,
  pageSize,
}: ListUsersParams) {
  const where: Record<string, unknown> = {};
  if (!includeDeleted) {
    where.isDeleted = false;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const skip = (page - 1) * pageSize;

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userListSelect,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data,
    pagination: {
      currentPage: page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { ...userListSelect, _count: { select: { orders: true, reviews: true } } },
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return user;
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}) {
  const email = normalizeEmail(data.email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError("Email is already in use", 400);
  }

  const role = data.role || UserRole.CUSTOMER;
  if (!Object.values(UserRole).includes(role)) {
    throw new AppError("Invalid role. Must be ADMIN or CUSTOMER", 400);
  }

  const user = await prisma.user.create({
    data: {
      name: data.name.trim(),
      email,
      password: await hashPassword(data.password),
      role,
    },
    select: userSelect,
  });

  return user;
}

export async function updateUser(
  id: string,
  data: {
    name?: string;
    email?: string;
    password?: string;
    image?: string | null;
    role?: UserRole;
    isDeleted?: boolean;
  }
) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("User not found", 404);
  }

  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) {
    if (data.name.trim().length === 0) {
      throw new AppError("Name cannot be empty", 400);
    }
    updateData.name = data.name.trim();
  }

  if (data.email !== undefined) {
    const email = normalizeEmail(data.email);
    const other = await prisma.user.findUnique({ where: { email } });
    if (other && other.id !== id) {
      throw new AppError("Email already in use by another user", 400);
    }
    updateData.email = email;
  }

  if (data.password !== undefined) {
    updateData.password = await hashPassword(data.password);
  }

  if (data.image !== undefined) {
    updateData.image = data.image ? data.image.trim() : null;
  }

  if (data.role !== undefined) {
    if (!Object.values(UserRole).includes(data.role)) {
      throw new AppError("Invalid role. Must be ADMIN or CUSTOMER", 400);
    }
    updateData.role = data.role;
  }

  if (data.isDeleted !== undefined) {
    updateData.isDeleted = data.isDeleted; // allows admin to restore a soft-deleted user
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: userSelect,
  });

  return user;
}

export async function deleteUser(id: string, permanent: boolean) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("User not found", 404);
  }

  if (permanent) {
    const orderCount = await prisma.order.count({
      where: { userId: id, isDeleted: false },
    });
    if (orderCount > 0) {
      throw new AppError(
        "Cannot permanently delete: user has existing orders",
        400
      );
    }
    await prisma.user.delete({ where: { id } });
    return { id, message: "User permanently deleted" };
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { isDeleted: true },
  });

  return { id: updated.id, message: "User marked as deleted" };
}