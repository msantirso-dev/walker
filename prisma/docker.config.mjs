// Configuración de Prisma para el contenedor: sin dependencias, lee DATABASE_URL del entorno.
export default {
  schema: "./schema.prisma",
  migrations: { path: "./migrations" },
  datasource: { url: process.env.DATABASE_URL },
};
