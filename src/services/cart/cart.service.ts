import prisma from "@/lib/prisma";
import { AppError } from "@/lib/error-handler";

const cartInclude = {
  product: {
    select: { id: true, title: true, price: true, image: true, stock: true },
  },
} as const;

export interface CartItemView {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
  product: {
    id: string;
    title: string;
    price: number;
    image: string | null;
    stock: number;
  };
  lineTotal: number;
}

function toView(item: any): CartItemView {
  const price = Number(item.product.price);
  return {
    ...item,
    product: { ...item.product, price },
    lineTotal: Number((price * item.quantity).toFixed(2)),
  };
}

function assertQuantity(quantity: unknown): number {
  const q = Number(quantity);
  if (!Number.isInteger(q) || q < 1) {
    throw new AppError("Quantity must be a positive integer", 400);
  }
  return q;
}

export async function getCart(userId: string) {
  const rows = await prisma.cartItem.findMany({
    where: { userId },
    include: cartInclude,
    orderBy: { createdAt: "desc" },
  });

  const items = rows.map(toView);
  const totalAmount = Number(
    items.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2)
  );
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return { items, totalAmount, itemCount };
}

export async function addToCart(
  userId: string,
  data: { productId: string; quantity?: unknown }
) {
  const product = await prisma.product.findUnique({
    where: { id: data.productId },
  });
  if (!product || product.isDeleted) {
    throw new AppError("Product not found", 400);
  }

  const quantity = assertQuantity(data.quantity ?? 1);

  const item = await prisma.cartItem.upsert({
    where: { userId_productId: { userId, productId: data.productId } },
    create: { userId, productId: data.productId, quantity },
    update: { quantity: { increment: quantity } },
    include: cartInclude,
  });

  return toView(item);
}

export async function updateCartItem(
  userId: string,
  id: string,
  data: { quantity?: unknown }
) {
  const existing = await prisma.cartItem.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    throw new AppError("Cart item not found", 404);
  }

  if (data.quantity === undefined) {
    throw new AppError("quantity is required", 400);
  }
  const quantity = assertQuantity(data.quantity);

  const item = await prisma.cartItem.update({
    where: { id },
    data: { quantity },
    include: cartInclude,
  });

  return toView(item);
}

export async function removeCartItem(userId: string, id: string) {
  const existing = await prisma.cartItem.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    throw new AppError("Cart item not found", 404);
  }

  await prisma.cartItem.delete({ where: { id } });
  return { id, message: "Cart item removed" };
}

export async function clearCart(userId: string) {
  const deleted = await prisma.cartItem.deleteMany({ where: { userId } });
  return { message: "Cart cleared", deletedCount: deleted.count };
}