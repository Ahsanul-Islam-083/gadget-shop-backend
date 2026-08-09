import prisma from "@/lib/prisma";
import { AppError } from "@/lib/error-handler";

export interface ListProductsParams {
  includeDeleted: boolean;
  search?: string;
  categoryId?: string;
  minPrice?: string;
  maxPrice?: string;
  sortBy?: string;
  order?: string;
  page: number;
  pageSize: number;
}

const SORT_FIELDS = ["newest", "price", "rating"] as const;
const SORT_DIRECTIONS = ["asc", "desc"] as const;

function parsePrice(value: string, label: string): number {
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) {
    throw new AppError(`Invalid ${label}`, 400);
  }
  return n;
}

function toView(product: any) {
  return { ...product, price: Number(product.price) };
}

async function reviewStatsFor(ids: string[]) {
  const map: Record<string, { avg: number; count: number }> = {};
  if (ids.length === 0) return map;

  const rows = await prisma.review.groupBy({
    by: ["productId"],
    where: { productId: { in: ids }, isDeleted: false },
    _avg: { rating: true },
    _count: { rating: true },
  });

  for (const row of rows) {
    map[row.productId] = {
      avg: Number(Number(row._avg.rating ?? 0).toFixed(2)),
      count: row._count.rating,
    };
  }
  return map;
}

export async function listProducts({
  includeDeleted,
  search,
  categoryId,
  minPrice,
  maxPrice,
  sortBy = "newest",
  order,
  page,
  pageSize,
}: ListProductsParams) {
  if (!SORT_FIELDS.includes(sortBy as (typeof SORT_FIELDS)[number])) {
    throw new AppError("sortBy must be one of: newest, price, rating", 400);
  }
  if (order !== undefined && !SORT_DIRECTIONS.includes(order as (typeof SORT_DIRECTIONS)[number])) {
    throw new AppError("order must be asc or desc", 400);
  }

  const dir = order ?? (sortBy === "newest" ? "desc" : "asc") as "asc" | "desc";

  const where: Record<string, unknown> = {};
  if (!includeDeleted) {
    where.isDeleted = false;
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { brand: { contains: search, mode: "insensitive" } },
    ];
  }
  if (categoryId) {
    where.categoryId = categoryId;
  }
  const priceFilter: Record<string, number> = {};
  if (minPrice) priceFilter.gte = parsePrice(minPrice, "minPrice");
  if (maxPrice) priceFilter.lte = parsePrice(maxPrice, "maxPrice");
  if (Object.keys(priceFilter).length > 0) {
    where.price = priceFilter;
  }

  const skip = (page - 1) * pageSize;
  const total = await prisma.product.count({ where });

  // Rating sort: Prisma cannot orderBy an aggregated relation average,
  // so fetch all matches, attach avgRating, and sort in JS (nulls last
  // in both directions, createdAt desc as tiebreaker), then slice.
  if (sortBy === "rating") {
    const all = await prisma.product.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
    });
    const ratings = await reviewStatsFor(all.map((p) => p.id));

    const rows = all.map((p) => ({
      ...toView(p),
      avgRating: ratings[p.id]?.avg ?? null,
      ratingCount: ratings[p.id]?.count ?? 0,
    }));

    rows.sort((a, b) => {
      const hasA = a.avgRating !== null;
      const hasB = b.avgRating !== null;
      if (hasA && hasB) {
        const cmp = a.avgRating - b.avgRating;
        const primary = dir === "desc" ? -cmp : cmp;
        if (primary !== 0) return primary;
      } else if (hasA !== hasB) {
        // unrated products always sort last, regardless of direction
        return hasA ? -1 : 1;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return {
      data: rows.slice(skip, skip + pageSize),
      pagination: {
        currentPage: page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  const orderBy: Record<string, unknown>[] = [{ createdAt: dir }];
  if (sortBy === "price") {
    orderBy.unshift({ price: dir });
  }

  const data = await prisma.product.findMany({
    where,
    include: { category: { select: { id: true, name: true } } },
    orderBy,
    skip,
    take: pageSize,
  });

  const ratings = await reviewStatsFor(data.map((p) => p.id));

  return {
    data: data.map((p) => ({
      ...toView(p),
      avgRating: ratings[p.id]?.avg ?? null,
      ratingCount: ratings[p.id]?.count ?? 0,
    })),
    pagination: {
      currentPage: page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true } } },
  });

  if (!product || product.isDeleted) {
    throw new AppError("Product not found", 404);
  }

  const ratings = await reviewStatsFor([id]);

  return {
    ...toView(product),
    avgRating: ratings[id]?.avg ?? null,
    ratingCount: ratings[id]?.count ?? 0,
  };
}

export async function createProduct(data: {
  title: string;
  brand?: string;
  description?: string;
  price: string | number;
  stock?: string | number;
  image?: string;
  categoryId: string;
}) {
  const title = data.title.trim();
  if (!title) {
    throw new AppError("Product title is required", 400);
  }

  const category = await prisma.category.findUnique({
    where: { id: data.categoryId },
  });
  if (!category) {
    throw new AppError("Category not found", 400);
  }

  const price = parsePrice(String(data.price), "price");
  const stock = Number(data.stock ?? 0);
  if (!Number.isInteger(stock) || stock < 0) {
    throw new AppError("Stock must be a non-negative integer", 400);
  }

  const product = await prisma.product.create({
    data: {
      title,
      brand: data.brand?.trim() || null,
      description: data.description?.trim() || null,
      price,
      stock,
      image: data.image || null,
      categoryId: data.categoryId,
    },
    include: { category: { select: { id: true, name: true } } },
  });

  return toView(product);
}

export async function updateProduct(
  id: string,
  data: {
    title?: string;
    brand?: string;
    description?: string;
    price?: string | number;
    stock?: string | number;
    image?: string;
    categoryId?: string;
    isDeleted?: boolean;
  }
) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Product not found", 404);
  }

  const updateData: Record<string, unknown> = {};

  if (data.title !== undefined) {
    const title = data.title.trim();
    if (!title) {
      throw new AppError("Product title cannot be empty", 400);
    }
    updateData.title = title;
  }

  if (data.brand !== undefined) {
    updateData.brand = data.brand.trim() || null;
  }

  if (data.description !== undefined) {
    updateData.description = data.description.trim() || null;
  }

  if (data.price !== undefined) {
    updateData.price = parsePrice(String(data.price), "price");
  }

  if (data.stock !== undefined) {
    const stock = Number(data.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      throw new AppError("Stock must be a non-negative integer", 400);
    }
    updateData.stock = stock;
  }

  if (data.image !== undefined) {
    updateData.image = data.image || null;
  }

  if (data.categoryId !== undefined) {
    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) {
      throw new AppError("Category not found", 400);
    }
    updateData.categoryId = data.categoryId;
  }

  if (data.isDeleted !== undefined) {
    updateData.isDeleted = data.isDeleted; // allows admin to restore a soft-deleted product
  }

  const product = await prisma.product.update({
    where: { id },
    data: updateData,
    include: { category: { select: { id: true, name: true } } },
  });

  return toView(product);
}

export async function deleteProduct(id: string, permanent: boolean) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Product not found", 404);
  }

  if (permanent) {
    const orderItemCount = await prisma.orderItem.count({
      where: { productId: id },
    });
    if (orderItemCount > 0) {
      throw new AppError(
        "Cannot permanently delete: product appears in past orders",
        400
      );
    }
    await prisma.product.delete({ where: { id } });
    return { id, message: "Product permanently deleted" };
  }

  const updated = await prisma.product.update({
    where: { id },
    data: { isDeleted: true },
  });

  return { id: updated.id, message: "Product marked as deleted" };
}