import prisma from "@/lib/prisma";
import { AppError } from "@/lib/error-handler";
import {
  Prisma,
  OrderStatus,
  PaymentStatus,
  UserRole,
} from "@/generated/prisma/client";

const orderWithItems = {
  orderItems: {
    include: { product: { select: { id: true, title: true } } },
  },
} as const;

const orderDetailed = {
  ...orderWithItems,
  statusHistory: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { changedAt: "asc" as const },
  },
} as const;

function toView(order: any) {
  return {
    ...order,
    totalAmount: Number(order.totalAmount),
    orderItems: order.orderItems?.map((i: any) => ({
      ...i,
      price: Number(i.price),
    })),
  };
}

export interface ListOrdersParams {
  userId: string;
  isAdmin: boolean;
  includeDeleted: boolean;
  page: number;
  pageSize: number;
}

export async function listOrders({
  userId,
  isAdmin,
  includeDeleted,
  page,
  pageSize,
}: ListOrdersParams) {
  const where: Record<string, unknown> = {};
  if (!isAdmin) {
    where.userId = userId;
  }
  if (!isAdmin || !includeDeleted) {
    where.isDeleted = false;
  }

  const skip = (page - 1) * pageSize;

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: orderWithItems,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    data: data.map(toView),
    pagination: {
      currentPage: page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getOrderById(id: string, user: { id: string; role: UserRole }) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: orderDetailed,
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }
  if (order.userId !== user.id && user.role !== UserRole.ADMIN) {
    throw new AppError("Order not found", 404);
  }
  if (order.isDeleted && user.role !== UserRole.ADMIN) {
    throw new AppError("Order not found", 404);
  }

  return toView(order);
}

export async function createOrderFromCart(userId: string) {
  const cart = await prisma.cartItem.findMany({
    where: { userId },
    include: { product: true },
  });
  if (cart.length === 0) {
    throw new AppError("Cart is empty", 400);
  }

  for (const item of cart) {
    if (!item.product || item.product.isDeleted) {
      throw new AppError("A product in your cart is no longer available", 400);
    }
    if (item.quantity > item.product.stock) {
      throw new AppError(
        `Insufficient stock for "${item.product.title}"`,
        400
      );
    }
  }

  const now = new Date();
  let total = new Prisma.Decimal(0);
  for (const item of cart) {
    total = total.add(item.product.price.mul(item.quantity));
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        userId,
        totalAmount: total,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.UNPAID,
      },
    });

    await tx.orderItem.createMany({
      data: cart.map((i) => ({
        orderId: order.id,
        productId: i.productId,
        quantity: i.quantity,
        price: i.product.price,
      })),
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: OrderStatus.PENDING,
        changedBy: userId,
        changedAt: now,
      },
    });

    await tx.cartItem.deleteMany({ where: { userId } });

    const fresh = await tx.order.findUniqueOrThrow({
      where: { id: order.id },
      include: orderDetailed,
    });

    return toView(fresh);
  });
}

export async function updateOrder(
  id: string,
  actorId: string,
  data: { status?: OrderStatus; paymentStatus?: PaymentStatus }
) {
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Order not found", 404);
  }

  const updateData: Record<string, unknown> = {};
  let statusChanged = false;

  if (data.status !== undefined) {
    if (!Object.values(OrderStatus).includes(data.status)) {
      throw new AppError("Invalid status. Must be a valid OrderStatus value", 400);
    }
    if (data.status !== existing.status) {
      updateData.status = data.status;
      statusChanged = true;
    }
  }

  if (data.paymentStatus !== undefined) {
    if (!Object.values(PaymentStatus).includes(data.paymentStatus)) {
      throw new AppError(
        "Invalid paymentStatus. Must be a valid PaymentStatus value",
        400
      );
    }
    updateData.paymentStatus = data.paymentStatus;
  }

  return prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: updateData });

    if (statusChanged) {
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          status: data.status as OrderStatus,
          changedBy: actorId,
        },
      });
    }

    const fresh = await tx.order.findUniqueOrThrow({
      where: { id },
      include: orderDetailed,
    });

    return toView(fresh);
  });
}

export async function getAnalytics(limit = 5) {
  const [revenue, statusGroups, topProducts] = await Promise.all([
    prisma.order.aggregate({
      where: { isDeleted: false, paymentStatus: PaymentStatus.PAID },
      _sum: { totalAmount: true },
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: { isDeleted: false },
      _count: { status: true },
    }),
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: { order: { isDeleted: false } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: limit,
    }),
  ]);

  const productIds = topProducts.map((p) => p.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, title: true, brand: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const orderCountByStatus: Record<string, number> = {};
  for (const s of Object.values(OrderStatus)) {
    orderCountByStatus[s] = 0;
  }
  for (const g of statusGroups) {
    orderCountByStatus[g.status] = g._count.status;
  }

  return {
    totalRevenue: Number(revenue._sum.totalAmount ?? 0),
    orderCountByStatus,
    topSellingProducts: topProducts.map((p) => ({
      productId: p.productId,
      title: productMap.get(p.productId)?.title ?? "Unknown",
      brand: productMap.get(p.productId)?.brand ?? null,
      totalQuantitySold: p._sum.quantity ?? 0,
    })),
  };
}