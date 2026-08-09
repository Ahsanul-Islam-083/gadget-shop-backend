import jwt from "jsonwebtoken";
import { UserRole } from "@/generated/prisma/client";

export interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
}

const SECRET = process.env.JWT_SECRET || "insecure-dev-secret-change-me";
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, {
    expiresIn: EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}