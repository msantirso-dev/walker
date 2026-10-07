import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

const globalForDb = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const adapter = new PrismaPg({ connectionString: env().DATABASE_URL, max: 10 });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalForDb.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForDb.prisma = db;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export { Prisma } from "@/generated/prisma/client";
