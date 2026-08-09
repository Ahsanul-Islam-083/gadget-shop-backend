import { Response } from "express";

export interface PaginationMeta {
  currentPage: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = "Success",
  status = 200
) {
  res.status(status).json({ success: true, message, data });
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
  message = "Success"
) {
  res.status(200).json({ success: true, message, data, pagination });
}