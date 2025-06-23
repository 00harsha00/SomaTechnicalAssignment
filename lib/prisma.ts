import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Optional: Enhance type safety for Todo model with JSON dependencies
declare module '@prisma/client' {
  interface Todo {
    dependencies: number[] | null;
  }
}