import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

const globalForDb = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  if (!globalForDb.prisma) {
    const adapter = new PrismaPg({ connectionString: env().DATABASE_URL, max: Number(process.env.DATABASE_POOL_SIZE ?? 10) });
    globalForDb.prisma = new PrismaClient({ adapter });
  }
  return globalForDb.prisma;
}

/** Cliente perezoso: no se conecta ni valida el entorno hasta el primer uso (permite compilar sin variables). */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const c = client();
    const v = Reflect.get(c, prop, c);
    return typeof v === "function" ? v.bind(c) : v;
  },
});

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export { Prisma } from "@/generated/prisma/client";
