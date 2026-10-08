-- Cobertura impositiva del anticipo (21 % + 3 % de la diferencia del club), configurable por campaña y fijada en cada pedido
ALTER TABLE "Campaign" ADD COLUMN "clubTaxBp" INTEGER NOT NULL DEFAULT 2400;
ALTER TABLE "Order" ADD COLUMN "clubTaxBp" INTEGER;
ALTER TABLE "OrderUnit" ADD COLUMN "advanceAmount" INTEGER NOT NULL DEFAULT 0;

-- Outfit: el club se compromete a comprar la diferencia hasta el mínimo; respaldo sugerido
ALTER TABLE "CampaignProduct" ADD COLUMN "clubCommitAt" TIMESTAMP(3),
  ADD COLUMN "clubCommitById" TEXT,
  ADD COLUMN "backupSuggestQty" INTEGER NOT NULL DEFAULT 5;

-- Envíos nuevos: a cargo del comprador por defecto
ALTER TABLE "ClubShipment" ALTER COLUMN "costBearer" SET DEFAULT 'BUYER';

-- Planilla de gestión propia del club (servicio adicional)
ALTER TABLE "Club" ADD COLUMN "managementPanel" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "ClubSheetStatus" AS ENUM ('PENDING', 'BALANCE_PAID', 'DELIVERED', 'CANCELLED', 'OTHER');

CREATE TABLE "ClubOrderSheet" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "status" "ClubSheetStatus" NOT NULL DEFAULT 'PENDING',
    "balancePaid" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "method" TEXT,
    "reference" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "deliveredTo" TEXT,
    "notes" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClubOrderSheet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClubOrderSheet_orderId_key" ON "ClubOrderSheet"("orderId");
CREATE INDEX "ClubOrderSheet_clubId_idx" ON "ClubOrderSheet"("clubId");
ALTER TABLE "ClubOrderSheet" ADD CONSTRAINT "ClubOrderSheet_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubOrderSheet" ADD CONSTRAINT "ClubOrderSheet_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
