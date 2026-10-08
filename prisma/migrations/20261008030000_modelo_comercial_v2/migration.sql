-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('PREPARATION', 'CATALOG', 'PRESALE', 'PRESALE_CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductFamily" AS ENUM ('GAME_KIT', 'OUTFIT', 'ACCESSORY', 'OTHER');

-- CreateEnum
CREATE TYPE "FabricTechnique" AS ENUM ('PENDING', 'SUBLIMATED', 'NON_SUBLIMATED', 'EMBROIDERED', 'PRINTED', 'OTHER');

-- CreateEnum
CREATE TYPE "OptionGroupType" AS ENUM ('CHOICE', 'TEXT', 'NUMBER');

-- CreateEnum
CREATE TYPE "OptionRole" AS ENUM ('NAME', 'NUMBER', 'LEGEND', 'OTHER');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('LEGACY_DEPOSIT', 'TEXTIL_ADVANCE');

-- CreateEnum
CREATE TYPE "CampaignAudience" AS ENUM ('ALL', 'SPORTS', 'CATEGORIES');

-- CreateEnum
CREATE TYPE "ProductionRuleType" AS ENUM ('NONE', 'FULL_CATEGORY', 'INITIAL_PURCHASE');

-- CreateEnum
CREATE TYPE "PaymentReceiver" AS ENUM ('TEXTIL', 'CLUB');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "SampleKind" AS ENUM ('TOP', 'BOTTOM', 'OTHER');

-- CreateEnum
CREATE TYPE "SampleAvailability" AS ENUM ('PENDING_DELIVERY', 'AVAILABLE', 'NOT_AVAILABLE');

-- CreateEnum
CREATE TYPE "PurchasePurpose" AS ENUM ('SAMPLE', 'INITIAL', 'BACKUP');

-- CreateEnum
CREATE TYPE "SizeDistributionStatus" AS ENUM ('PENDING', 'DEFINED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PREPARING', 'DISPATCHED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "CostBearer" AS ENUM ('PENDING', 'TEXTIL', 'CLUB');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignStatus" ADD VALUE 'ACTIVATION_REQUESTED';
ALTER TYPE "CampaignStatus" ADD VALUE 'ACTIVATION_APPROVED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentKind" ADD VALUE 'ADVANCE';
ALTER TYPE "PaymentKind" ADD VALUE 'CLUB_BALANCE';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "catalogStatus" "CatalogStatus" NOT NULL DEFAULT 'PREPARATION',
ADD COLUMN     "family" "ProductFamily" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "technique" "FabricTechnique" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "activationApprovedAt" TIMESTAMP(3),
ADD COLUMN     "activationApprovedById" TEXT,
ADD COLUMN     "activationNote" TEXT,
ADD COLUMN     "activationRequestedAt" TIMESTAMP(3),
ADD COLUMN     "activationRequestedById" TEXT,
ADD COLUMN     "audience" "CampaignAudience" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "pricingModel" "PricingModel" NOT NULL DEFAULT 'TEXTIL_ADVANCE';

-- AlterTable
ALTER TABLE "CampaignProduct" ADD COLUMN     "clubPurchaseId" TEXT,
ADD COLUMN     "expectedQty" INTEGER,
ADD COLUMN     "initialPurchaseEstimated" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "initialPurchaseMin" INTEGER,
ADD COLUMN     "initialPurchaseWaived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "markupBp" INTEGER,
ADD COLUMN     "productionApprovedAt" TIMESTAMP(3),
ADD COLUMN     "ruleApprovedAt" TIMESTAMP(3),
ADD COLUMN     "ruleApprovedById" TEXT,
ADD COLUMN     "ruleCategoryId" TEXT,
ADD COLUMN     "ruleNote" TEXT,
ADD COLUMN     "ruleType" "ProductionRuleType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "textilPrice" INTEGER;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "advancePaid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "advanceRequired" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "clubBalanceRequired" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "clubPaid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "policyVersion" TEXT,
ADD COLUMN     "pricingModel" "PricingModel" NOT NULL DEFAULT 'LEGACY_DEPOSIT';

-- AlterTable
ALTER TABLE "OrderUnit" ADD COLUMN     "legend" TEXT,
ADD COLUMN     "noSizeChange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "optionsClub" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "optionsTextil" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "textilPrice" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "installments" INTEGER,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "providerFees" JSONB,
ADD COLUMN     "providerGross" INTEGER,
ADD COLUMN     "providerNet" INTEGER,
ADD COLUMN     "providerTotalPaid" INTEGER,
ADD COLUMN     "receiver" "PaymentReceiver" NOT NULL DEFAULT 'TEXTIL';

-- AlterTable
ALTER TABLE "ProductionLot" ADD COLUMN     "shipmentId" TEXT;

-- CreateTable
CREATE TABLE "ProductOptionGroup" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OptionGroupType" NOT NULL,
    "role" "OptionRole" NOT NULL DEFAULT 'OTHER',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "help" TEXT,
    "dependsOnGroupId" TEXT,
    "dependsOnValueIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxLength" INTEGER,
    "numberMin" INTEGER,
    "numberMax" INTEGER,
    "priceTextil" INTEGER NOT NULL DEFAULT 0,
    "priceClub" INTEGER NOT NULL DEFAULT 0,
    "splitConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "blocksSizeChange" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOptionValue" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "priceTextil" INTEGER NOT NULL DEFAULT 0,
    "priceClub" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderUnitOption" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "groupId" TEXT,
    "groupName" TEXT NOT NULL,
    "role" "OptionRole" NOT NULL,
    "value" TEXT NOT NULL,
    "priceTextil" INTEGER NOT NULL DEFAULT 0,
    "priceClub" INTEGER NOT NULL DEFAULT 0,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderUnitOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubAgreement" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "exclusive" BOOLEAN NOT NULL DEFAULT true,
    "brandLine" TEXT,
    "samplesCommitted" TEXT,
    "catalogAgreed" TEXT,
    "activationConditions" TEXT,
    "initialPurchases" TEXT,
    "pricingRules" TEXT,
    "notes" TEXT,
    "contractFileKey" TEXT,
    "contractFileName" TEXT,
    "alertDaysBefore" INTEGER NOT NULL DEFAULT 60,
    "lastAlertAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizeSampleSet" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "kind" "SampleKind" NOT NULL,
    "name" TEXT NOT NULL,
    "referenceGarmentId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "availability" "SampleAvailability" NOT NULL DEFAULT 'PENDING_DELIVERY',
    "location" TEXT,
    "notes" TEXT,
    "purchaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SizeSampleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizeSampleItem" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "sizeLabel" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SizeSampleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSampleLink" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "notes" TEXT,

    CONSTRAINT "ProductSampleLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubPurchase" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "campaignId" TEXT,
    "productId" TEXT,
    "purposes" "PurchasePurpose"[],
    "committedQty" INTEGER NOT NULL,
    "paidQty" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER,
    "sizeStatus" "SizeDistributionStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubPurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "sizeLabel" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ClubPurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubShipment" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "clubId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PREPARING',
    "address" TEXT NOT NULL,
    "receiverName" TEXT NOT NULL,
    "receiverPhone" TEXT,
    "carrier" TEXT,
    "trackingRef" TEXT,
    "cost" INTEGER,
    "costBearer" "CostBearer" NOT NULL DEFAULT 'PENDING',
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "receivedBy" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CampaignSports" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CampaignSports_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_CampaignCategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CampaignCategories_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "ClubAgreement_clubId_idx" ON "ClubAgreement"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSampleLink_productId_setId_key" ON "ProductSampleLink"("productId", "setId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubShipment_campaignId_number_key" ON "ClubShipment"("campaignId", "number");

-- CreateIndex
CREATE INDEX "_CampaignSports_B_index" ON "_CampaignSports"("B");

-- CreateIndex
CREATE INDEX "_CampaignCategories_B_index" ON "_CampaignCategories"("B");

-- AddForeignKey
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_dependsOnGroupId_fkey" FOREIGN KEY ("dependsOnGroupId") REFERENCES "ProductOptionGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_ruleCategoryId_fkey" FOREIGN KEY ("ruleCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_clubPurchaseId_fkey" FOREIGN KEY ("clubPurchaseId") REFERENCES "ClubPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderUnitOption" ADD CONSTRAINT "OrderUnitOption_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "OrderUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionLot" ADD CONSTRAINT "ProductionLot_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "ClubShipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubAgreement" ADD CONSTRAINT "ClubAgreement_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeSampleSet" ADD CONSTRAINT "SizeSampleSet_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeSampleSet" ADD CONSTRAINT "SizeSampleSet_referenceGarmentId_fkey" FOREIGN KEY ("referenceGarmentId") REFERENCES "Garment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeSampleSet" ADD CONSTRAINT "SizeSampleSet_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "ClubPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeSampleItem" ADD CONSTRAINT "SizeSampleItem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "SizeSampleSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSampleLink" ADD CONSTRAINT "ProductSampleLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSampleLink" ADD CONSTRAINT "ProductSampleLink_setId_fkey" FOREIGN KEY ("setId") REFERENCES "SizeSampleSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPurchase" ADD CONSTRAINT "ClubPurchase_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPurchase" ADD CONSTRAINT "ClubPurchase_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPurchase" ADD CONSTRAINT "ClubPurchase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPurchaseItem" ADD CONSTRAINT "ClubPurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "ClubPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubShipment" ADD CONSTRAINT "ClubShipment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubShipment" ADD CONSTRAINT "ClubShipment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampaignSports" ADD CONSTRAINT "_CampaignSports_A_fkey" FOREIGN KEY ("A") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampaignSports" ADD CONSTRAINT "_CampaignSports_B_fkey" FOREIGN KEY ("B") REFERENCES "Sport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampaignCategories" ADD CONSTRAINT "_CampaignCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampaignCategories" ADD CONSTRAINT "_CampaignCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────── Datos existentes: se conservan las reglas con las que se vendió ─────────

-- Las campañas existentes siguen con el modelo de seña heredado; las nuevas usan anticipo textil.
UPDATE "Campaign" SET "pricingModel" = 'LEGACY_DEPOSIT';

-- Pagos existentes: destinatario según la cuenta de cobro de la campaña.
UPDATE "Payment" p SET "receiver" = 'CLUB'
FROM "Order" o JOIN "Campaign" c ON c."id" = o."campaignId" JOIN "PaymentAccount" a ON a."id" = c."paymentAccountId"
WHERE p."orderId" = o."id" AND a."owner" = 'CLUB';

-- Estado de catálogo inicial de los productos existentes.
UPDATE "Product" SET "catalogStatus" = CASE WHEN "active" THEN 'CATALOG'::"CatalogStatus" ELSE 'ARCHIVED'::"CatalogStatus" END;
UPDATE "Product" p SET "catalogStatus" = 'PRESALE'
WHERE EXISTS (SELECT 1 FROM "CampaignProduct" cp JOIN "Campaign" c ON c."id" = cp."campaignId" WHERE cp."productId" = p."id" AND cp."active" AND c."status" = 'PUBLISHED');

-- Personalización heredada (nombre y número) convertida a grupos de opciones.
-- El reparto textil/club no estaba definido: se carga todo como textil y queda marcado como pendiente.
INSERT INTO "ProductOptionGroup" ("id", "productId", "name", "type", "role", "required", "sort", "maxLength", "priceTextil", "priceClub", "splitConfirmed", "blocksSizeChange", "dependsOnValueIds")
SELECT 'mig' || md5(random()::text || "id" || 'name'), "id", 'Nombre estampado', 'TEXT', 'NAME', false, 10, "persNameMaxLen", "persNamePrice", 0, false, true, '{}'
FROM "Product" WHERE "persNameEnabled";
INSERT INTO "ProductOptionGroup" ("id", "productId", "name", "type", "role", "required", "sort", "numberMin", "numberMax", "priceTextil", "priceClub", "splitConfirmed", "blocksSizeChange", "dependsOnValueIds")
SELECT 'mig' || md5(random()::text || "id" || 'number'), "id", 'Número', 'NUMBER', 'NUMBER', false, 20, "persNumberMin", "persNumberMax", "persNumberPrice", 0, false, true, '{}'
FROM "Product" WHERE "persNumberEnabled";
