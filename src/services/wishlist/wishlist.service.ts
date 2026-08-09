import prisma from "@/lib/prisma";
import { AppError } from "@/lib/error-handler";

const wishlistInclude = {
  product: {
    select: { id: true, title: true, price: true, image: true, stock: true },
  },
} as const;

function toView(item: any) {
  return {
    ...item,
    product: { ...item.product, price: Number(item.product.price) },
  };
}

export async function getWishlist(userId: string) {
  const rows = await prisma.wishlistItem.findMany({
    where: { userId },
    include: wishlistInclude,
    orderBy: { createdAt: "desc" },
  });

  return { items: rows.map(toView) };
}

export async function addToWishlist(userId: string, productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });
  if (!product || product.isDeleted) {
    throw new AppError("Product not found", 400);
  }

  const existing = await prisma.wishlistItem.findUnique({
    where: { userId_productId: { userId, productId } },
    include: wishlistInclude,
  });
  if (existing) {
    return { item: toView(existing), added: false };
  }

  const item = await prisma.wishlistItem.create({
    data: { userId, productId },
    include: wishlistInclude,
  });

  return { item: toView(item), added: true };
}

export async function removeFromWishlist(userId: string, id: string) {
  const existing = await prisma.wishlistItem.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    throw new AppError("Wishlist item not found", 404);
  }

  await prisma.wishlistItem.delete({ where: { id } });
  return { id, message: "Wishlist item removed" };
}

export async function toggleWishlist(userId: string, productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });
  if (!product || product.isDeleted) {
    throw new AppError("Product not found", 400);
  }

  const existing = await prisma.wishlistItem.findUnique({
    where: { userId_productId: { userId, productId } },
  });

  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
    return { inWishlist: false };
  }

  const item = await prisma.wishlistItem.create({
    data: { userId, productId },
    include: wishlistInclude,
  });

  return { inWishlist: true, item: toView(item) };
}