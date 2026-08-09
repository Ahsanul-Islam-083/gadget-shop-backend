import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

interface PrismaClientError extends Error {
  code?: string;
}

export function errorHandler(
  err: PrismaClientError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res
      .status(err.statusCode)
      .json({ success: false, message: err.message });
  }

  // Prisma error code mapping (same convention as the starter demo)
  if (err.code === "P2002") {
    return res.status(400).json({
      success: false,
      message: "A record with this value already exists",
    });
  }
  if (err.code === "P2025") {
    return res.status(404).json({
      success: false,
      message: "Record not found",
    });
  }
  if (err.code === "P2003") {
    return res.status(400).json({
      success: false,
      message: "Cannot delete: related records exist",
    });
  }

  console.error(err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}