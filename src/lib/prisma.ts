import { PrismaClient } from "@prisma/client";

// Single shared PrismaClient for the whole app.
//
// Why a singleton: Next.js hot-reloads modules on every code change in dev.
// A new `new PrismaClient()` per reload opens a new pool of DB connections and
// quickly exhausts them ("too many connections" warnings). Stashing the client
// on `globalThis` means reloads reuse the same instance. In production the
// module is evaluated once, so the guard is a no-op there.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
