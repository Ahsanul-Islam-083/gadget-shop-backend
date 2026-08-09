import prisma from "@/lib/prisma";
import { AppError } from "@/lib/error-handler";

export interface ListCategoriesParams {
  includeDeleted: boolean;
  search?: string;
  page: number;
  pageSize: number;
}

export async function listCategories({
  includeDeleted,
  search,
  page,
  pageSize,
}: ListCategoriesParams) {
  const where: Record<string, unknown> = {};
  if (!includeDeleted) {
    where.isDeleted = false;
  }
  if (search) {
    where.OR = [{ name: { contains: search, mode: "insensitive" } }];
  }

  const skip = (page - 1) * pageSize;

  const [data, total] = await Promise.all([
    prisma.category.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.category.count({ where }),
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

export async function getCategoryById(id: string) {
  const category = await prisma.category.findUnique({ where: { id } });

  if (!category || category.isDeleted) {
    throw new AppError("Category not found", 404);
  }

  return category;
}

export async function createCategory(data: { name: string }) {
  const name = data.name.trim();
  if (!name) {
    throw new AppError("Category name cannot be empty", 400);
  }

  const existing = await prisma.category.findUnique({ where: { name } });
  if (existing) {
    throw new AppError("Category already exists", 400);
  }

  return prisma.category.create({ data: { name } });
}

export async function updateCategory(
  id: string,
  data: { name?: string; isDeleted?: boolean }
) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Category not found", 404);
  }

  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) {
      throw new AppError("Category name cannot be empty", 400);
    }
    const other = await prisma.category.findUnique({ where: { name } });
    if (other && other.id !== id) {
      throw new AppError("Category name already in use", 400);
    }
    updateData.name = name;
  }

  if (data.isDeleted !== undefined) {
    updateData.isDeleted = data.isDeleted; // allows admin to restore a soft-deleted category
  }

  return prisma.category.update({ where: { id }, data: updateData });
}

export async function deleteCategory(id: string, permanent: boolean) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("Category not found", 404);
  }

  if (permanent) {
    const productCount = await prisma.product.count({
      where: { categoryId: id },
    });
    if (productCount > 0) {
      throw new AppError(
        "Cannot permanently delete: category has products",
        400
      );
    }
    await prisma.category.delete({ where: { id } });
    return { id, message: "Category permanently deleted" };
  }

  const updated = await prisma.category.update({
    where: { id },
    data: { isDeleted: true },
  });

  return { id: updated.id, message: "Category marked as deleted" };
}