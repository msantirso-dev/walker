-- CreateEnum
CREATE TYPE "AdditionalReason" AS ENUM ('LATE_SALES', 'BOUTIQUE', 'SIZE_CHANGES', 'OTHER');

-- CreateEnum
CREATE TYPE "DebtBlockScope" AS ENUM ('ADDITIONAL_ONLY', 'WHOLE_SHIPMENT');

-- CreateEnum
CREATE TYPE "DeliveryDaysKind" AS ENUM ('PENDING', 'CALENDAR', 'BUSINESS');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

-- AlterEnum
ALTER TYPE "ImageView" ADD VALUE 'SIZE_CHART';

-- AlterEnum
ALTER TYPE "PurchasePurpose" ADD VALUE 'ADDITIONAL';

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "debtBlockScope" "DebtBlockScope",
ADD COLUMN     "memberNumberMode" TEXT NOT NULL DEFAULT 'HIDDEN';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "deductionBpA" INTEGER NOT NULL DEFAULT 2100,
ADD COLUMN     "deductionBpB" INTEGER NOT NULL DEFAULT 350,
ADD COLUMN     "deliveryDaysKind" "DeliveryDaysKind" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "policyLegendChanges" TEXT,
ADD COLUMN     "policyPlainChanges" TEXT,
ADD COLUMN     "productionStartedAt" TIMESTAMP(3),
ADD COLUMN     "productionStartedById" TEXT,
ALTER COLUMN "clubTaxBp" SET DEFAULT 2450;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deductionBpA" INTEGER,
ADD COLUMN     "deductionBpB" INTEGER,
ADD COLUMN     "memberId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "after" JSONB,
ADD COLUMN     "before" JSONB;

-- AlterTable
ALTER TABLE "ClubPurchase" ADD COLUMN     "agreedAmount" INTEGER,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "reasons" "AdditionalReason"[];

-- AlterTable
ALTER TABLE "ClubPurchaseItem" ADD COLUMN     "productId" TEXT,
ADD COLUMN     "unitPrice" INTEGER;

-- CreateTable
CREATE TABLE "ClubPurchasePayment" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubPurchasePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionLotPurchaseItem" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "purchaseItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ProductionLotPurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandSettings" (
    "id" TEXT NOT NULL DEFAULT 'brand',
    "name" TEXT NOT NULL DEFAULT 'BACK',
    "tagline" TEXT,
    "logoUrl" TEXT,
    "colorPrimary" TEXT NOT NULL DEFAULT '#1D2B4F',
    "colorAccent" TEXT NOT NULL DEFAULT '#E9B949',
    "contactEmail" TEXT,
    "whatsapp" TEXT,
    "instagram" TEXT,
    "aboutText" TEXT,
    "formulaApprovedAt" TIMESTAMP(3),
    "formulaApprovedById" TEXT,
    "formulaNote" TEXT,
    "debtBlockDefault" "DebtBlockScope" NOT NULL DEFAULT 'ADDITIONAL_ONLY',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "BrandSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "message" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "MemberSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberPasswordReset" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberPasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberClub" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "memberNumber" TEXT,
    "validatedAt" TIMESTAMP(3),
    "validatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberClub_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubPurchasePayment_purchaseId_idx" ON "ClubPurchasePayment"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionLotPurchaseItem_lotId_purchaseItemId_key" ON "ProductionLotPurchaseItem"("lotId", "purchaseItemId");

-- CreateIndex
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MemberSession_tokenHash_key" ON "MemberSession"("tokenHash");

-- CreateIndex
CREATE INDEX "MemberSession_memberId_idx" ON "MemberSession"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberPasswordReset_tokenHash_key" ON "MemberPasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "MemberClub_clubId_idx" ON "MemberClub"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberClub_memberId_clubId_key" ON "MemberClub"("memberId", "clubId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPurchaseItem" ADD CONSTRAINT "ClubPurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPurchasePayment" ADD CONSTRAINT "ClubPurchasePayment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "ClubPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionLotPurchaseItem" ADD CONSTRAINT "ProductionLotPurchaseItem_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "ProductionLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionLotPurchaseItem" ADD CONSTRAINT "ProductionLotPurchaseItem_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "ClubPurchaseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSession" ADD CONSTRAINT "MemberSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPasswordReset" ADD CONSTRAINT "MemberPasswordReset_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberClub" ADD CONSTRAINT "MemberClub_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberClub" ADD CONSTRAINT "MemberClub_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Campañas existentes: conservar la cobertura anterior (21 % + 3 %) desglosada en sus dos componentes
UPDATE "Campaign" SET "deductionBpA" = 2100, "deductionBpB" = "clubTaxBp" - 2100 WHERE "clubTaxBp" >= 2100;
UPDATE "Campaign" SET "deductionBpA" = "clubTaxBp", "deductionBpB" = 0 WHERE "clubTaxBp" < 2100;
-- Fila única de marca
INSERT INTO "BrandSettings" ("id", "updatedAt") VALUES ('brand', NOW()) ON CONFLICT DO NOTHING;
