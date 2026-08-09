import prisma from "@/lib/prisma";
import { AppError } from "@/lib/error-handler";
import { UserRole } from "@/generated/prisma/client";

const reviewInclude = {
  user: { select: { id: true, name: true } },
  product: { select: { id: true, title: true } },
} as const;

interface RequestUser {
  id: string;
  role: UserRole;
}

function isAdmin(user: RequestUser): boolean {
  return user.role === UserRole.ADMIN;
}

function assertRating(rating: unknown): number {
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) {
    throw new AppError("Rating must be an integer between 1 and 5", 400);
  }
  return r;
}

async function findReviewOrThrow(id: string) {
  const review = await prisma.review.findUnique({
    where: { id },
    include: reviewInclude,
  });
  if (!review) {
    throw new AppError("Review not found", 404);
  }
  return review;
}

export async function listReviews(params: {
  userId: string;
  isAdmin: boolean;
  includeDeleted: boolean;
  productId?: string;
  page: number;
  pageSize: number;
}) {
  const { userId, isAdmin, includeDeleted, productId, page, pageSize } = params;

  const where: Record<string, unknown> = {};
  if (!isAdmin) {
    where.userId = userId;
  }
  if (!isAdmin || !includeDeleted) {
    where.isDeleted = false;
  }
  if (productId) {
    where.productId = productId;
  }

  const skip = (page - 1) * pageSize;

  const [data, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: reviewInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.review.count({ where }),
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

export async function getReviewById(id: string, user: RequestUser) {
  const review = await findReviewOrThrow(id);

  if (review.userId !== user.id && !isAdmin(user)) {
    throw new AppError("Review not found", 404);
  }
  if (review.isDeleted && !isAdmin(user)) {
    throw new AppError("Review not found", 404);
  }

  return review;
}

export async function createReview(
  data: { productId: string; rating: unknown; comment?: string },
  userId: string
) {
  const product = await prisma.product.findUnique({
    where: { id: data.productId },
  });
  if (!product || product.isDeleted) {
    throw new AppError("Product not found", 400);
  }

  const rating = assertRating(data.rating);

  const existing = await prisma.review.findUnique({
    where: { userId_productId: { userId, productId: data.productId } },
  });
  if (existing) {
    throw new AppError("You have already reviewed this product", 400);
  }

  return prisma.review.create({
    data: {
      userId,
      productId: data.productId,
      rating,
      comment: data.comment?.trim() || null,
    },
    include: reviewInclude,
  });
}

export async function updateReview(
  id: string,
  data: { rating?: unknown; comment?: string; isDeleted?: boolean },
  user: RequestUser
) {
  const review = await findReviewOrThrow(id);

  if (review.userId !== user.id && !isAdmin(user)) {
    throw new AppError("Review not found", 404);
  }

  const updateData: Record<string, unknown> = {};

  if (data.rating !== undefined) {
    updateData.rating = assertRating(data.rating);
  }

  if (data.comment !== undefined) {
    updateData.comment = data.comment.trim() || null;
  }

  if (data.isDeleted !== undefined) {
    updateData.isDeleted = data.isDeleted;
  }

  return prisma.review.update({
    where: { id },
    data: updateData,
    include: reviewInclude,
  });
}

export async function deleteReview(
  id: string,
  permanent: boolean,
  user: RequestUser
) {
  const review = await findReviewOrThrow(id);

  if (review.userId !== user.id && !isAdmin(user)) {
    throw new AppError("Review not found", 404);
  }

  if (permanent) {
    await prisma.review.delete({ where: { id } });
    return { id, message: "Review permanently deleted" };
  }

  await prisma.review.update({ where: { id }, data: { isDeleted: true } });
  return { id, message: "Review marked as deleted" };
}