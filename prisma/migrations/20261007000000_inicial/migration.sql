-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TEXTIL_ADMIN', 'CLUB_ADMIN', 'PRODUCTION', 'DELIVERY');

-- CreateEnum
CREATE TYPE "AccountOwner" AS ENUM ('TEXTIL', 'CLUB');

-- CreateEnum
CREATE TYPE "SizeGroup" AS ENUM ('KIDS', 'NUMERIC', 'ALPHA', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('SIMPLE', 'SET', 'COMBO');

-- CreateEnum
CREATE TYPE "ImageView" AS ENUM ('FRONT', 'BACK', 'DETAIL', 'OTHER');

-- CreateEnum
CREATE TYPE "ImageTag" AS ENUM ('REAL', 'DESIGN', 'REFERENCE');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'IN_PRODUCTION', 'READY_FOR_PICKUP', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('FULL', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "DepositType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "MinDecision" AS ENUM ('EXTEND', 'CANCEL', 'CONTINUE');

-- CreateEnum
CREATE TYPE "LotCondition" AS ENUM ('DEPOSIT_APPROVED', 'FULLY_PAID');

-- CreateEnum
CREATE TYPE "BenefitType" AS ENUM ('FIXED_PER_UNIT', 'PERCENT_OF_GARMENTS');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('PICKUP', 'SHIPPING');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('NOT_READY', 'READY', 'PARTIAL', 'DELIVERED');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('DEPOSIT', 'BALANCE', 'FULL', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFER', 'MERCADOPAGO', 'CASH');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'IN_PRODUCTION', 'QUALITY_CONTROL', 'READY_TO_SHIP', 'RECEIVED_BY_CLUB');

-- CreateEnum
CREATE TYPE "LotKind" AS ENUM ('MAIN', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'NOT_SENT_NO_PROVIDER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "clubId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sport" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Sport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "coverUrl" TEXT,
    "colorPrimary" TEXT NOT NULL DEFAULT '#0F4D3A',
    "colorSecondary" TEXT NOT NULL DEFAULT '#D9A520',
    "city" TEXT,
    "province" TEXT,
    "venue" TEXT,
    "pickupAddress" TEXT,
    "pickupHours" TEXT,
    "officeHours" TEXT,
    "conditions" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "website" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubSport" (
    "clubId" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,

    CONSTRAINT "ClubSport_pkey" PRIMARY KEY ("clubId","sportId")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "sportId" TEXT,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubPhoto" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClubPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAccount" (
    "id" TEXT NOT NULL,
    "owner" "AccountOwner" NOT NULL,
    "clubId" TEXT,
    "label" TEXT NOT NULL,
    "bankHolder" TEXT,
    "bankName" TEXT,
    "bankCbu" TEXT,
    "bankAlias" TEXT,
    "bankCuit" TEXT,
    "mpAccessTokenEnc" TEXT,
    "mpWebhookSecretEnc" TEXT,
    "mpPublicLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Garment" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variant" TEXT,
    "material" TEXT,
    "care" TEXT,
    "measureA" TEXT NOT NULL DEFAULT 'Ancho de pecho',
    "measureB" TEXT NOT NULL DEFAULT 'Largo',
    "measureUnit" TEXT NOT NULL DEFAULT 'cm',
    "measureNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Garment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarmentSize" (
    "id" TEXT NOT NULL,
    "garmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" "SizeGroup" NOT NULL,
    "sort" INTEGER NOT NULL,
    "measureA" DECIMAL(6,1),
    "measureB" DECIMAL(6,1),
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GarmentSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ProductKind" NOT NULL DEFAULT 'SIMPLE',
    "sportId" TEXT,
    "audience" TEXT,
    "basePrice" INTEGER NOT NULL,
    "manufacturingTerms" TEXT,
    "persNameEnabled" BOOLEAN NOT NULL DEFAULT false,
    "persNamePrice" INTEGER NOT NULL DEFAULT 0,
    "persNameMaxLen" INTEGER NOT NULL DEFAULT 12,
    "persNumberEnabled" BOOLEAN NOT NULL DEFAULT false,
    "persNumberPrice" INTEGER NOT NULL DEFAULT 0,
    "persNumberMin" INTEGER NOT NULL DEFAULT 0,
    "persNumberMax" INTEGER NOT NULL DEFAULT 99,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductComponent" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "garmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "printTarget" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "view" "ImageView" NOT NULL DEFAULT 'FRONT',
    "tag" "ImageTag" NOT NULL DEFAULT 'DESIGN',
    "alt" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "season" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "deliveryDaysMin" INTEGER NOT NULL DEFAULT 30,
    "deliveryDaysMax" INTEGER NOT NULL DEFAULT 40,
    "showCatalogWhenClosed" BOOLEAN NOT NULL DEFAULT true,
    "paymentAccountId" TEXT NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL DEFAULT 'DEPOSIT',
    "depositType" "DepositType" NOT NULL DEFAULT 'PERCENT',
    "depositValue" INTEGER NOT NULL DEFAULT 50,
    "balanceDueText" TEXT,
    "allowMercadoPago" BOOLEAN NOT NULL DEFAULT true,
    "allowTransfer" BOOLEAN NOT NULL DEFAULT true,
    "mpReservationMinutes" INTEGER NOT NULL DEFAULT 30,
    "transferHoldHours" INTEGER NOT NULL DEFAULT 72,
    "lotCondition" "LotCondition" NOT NULL DEFAULT 'DEPOSIT_APPROVED',
    "minUnits" INTEGER,
    "maxUnits" INTEGER,
    "minDecision" "MinDecision",
    "minDecisionNote" TEXT,
    "minDecisionAt" TIMESTAMP(3),
    "minDecisionById" TEXT,
    "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pickupInstructions" TEXT,
    "shippingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shippingPrice" INTEGER NOT NULL DEFAULT 0,
    "shippingNotes" TEXT,
    "memberNumberMode" TEXT NOT NULL DEFAULT 'OPTIONAL',
    "policyChanges" TEXT,
    "policyCancellation" TEXT,
    "policyRefunds" TEXT,
    "minPolicyText" TEXT,
    "faq" JSONB,
    "productionNotice" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignProduct" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "listPrice" INTEGER,
    "maxUnits" INTEGER,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CampaignProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitRule" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "BenefitType" NOT NULL,
    "value" INTEGER NOT NULL,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenefitRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitSettlement" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenefitSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Buyer" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Buyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "pickupCode" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerPhone" TEXT NOT NULL,
    "memberNumber" TEXT,
    "deliveryMethod" "DeliveryMethod" NOT NULL DEFAULT 'PICKUP',
    "shippingAddress" TEXT,
    "notes" TEXT,
    "itemsTotal" INTEGER NOT NULL,
    "persTotal" INTEGER NOT NULL,
    "shippingTotal" INTEGER NOT NULL,
    "discountTotal" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "depositRequired" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "confirmedAt" TIMESTAMP(3),
    "reservedUntil" TIMESTAMP(3),
    "overCapacity" BOOLEAN NOT NULL DEFAULT false,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "inReviewAmount" INTEGER NOT NULL DEFAULT 0,
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'NOT_READY',
    "termsSnapshot" JSONB NOT NULL,
    "termsHash" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sport" TEXT,
    "category" TEXT,
    "team" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderUnit" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productDesc" TEXT,
    "unitPrice" INTEGER NOT NULL,
    "listPrice" INTEGER,
    "playerId" TEXT,
    "persName" TEXT,
    "persNumber" TEXT,
    "persPrice" INTEGER NOT NULL DEFAULT 0,
    "benefitAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "UnitStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" TIMESTAMP(3),
    "deliveryId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderUnitComponent" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "garmentId" TEXT NOT NULL,
    "garmentCode" TEXT NOT NULL,
    "garmentName" TEXT NOT NULL,
    "variant" TEXT,
    "label" TEXT NOT NULL,
    "sizeLabel" TEXT NOT NULL,
    "printTarget" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrderUnitComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "statusDetail" TEXT,
    "operationRef" TEXT,
    "replacesPaymentId" TEXT,
    "providerPreferenceId" TEXT,
    "providerPaymentId" TEXT,
    "initPoint" TEXT,
    "expiresAt" TIMESTAMP(3),
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "originalName" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountId" TEXT,
    "eventKey" TEXT NOT NULL,
    "dataId" TEXT,
    "signatureOk" BOOLEAN NOT NULL,
    "result" TEXT,
    "payload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulatedPayment" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulatedPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionLot" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" "LotKind" NOT NULL DEFAULT 'MAIN',
    "status" "LotStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "snapshot" JSONB,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionLotUnit" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProductionLotUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredById" TEXT NOT NULL,
    "receivedByName" TEXT NOT NULL,
    "receivedByNote" TEXT,
    "balanceException" TEXT,
    "notes" TEXT,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "clubId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "data" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_clubId_idx" ON "User"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_name_key" ON "Sport"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

-- CreateIndex
CREATE INDEX "Category_clubId_idx" ON "Category"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_clubId_sportId_name_key" ON "Category"("clubId", "sportId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Garment_clubId_code_key" ON "Garment"("clubId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "GarmentSize_garmentId_label_key" ON "GarmentSize"("garmentId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Product_clubId_code_key" ON "Product"("clubId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductComponent_productId_label_key" ON "ProductComponent"("productId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_clubId_slug_key" ON "Campaign"("clubId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignProduct_campaignId_productId_key" ON "CampaignProduct"("campaignId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitRule_campaignId_key" ON "BenefitRule"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Buyer_clubId_email_key" ON "Buyer"("clubId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Order_accessTokenHash_key" ON "Order"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Order_pickupCode_key" ON "Order"("pickupCode");

-- CreateIndex
CREATE INDEX "Order_clubId_idx" ON "Order"("clubId");

-- CreateIndex
CREATE INDEX "Order_campaignId_status_idx" ON "Order"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_campaignId_idempotencyKey_key" ON "Order"("campaignId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrderUnit_ref_key" ON "OrderUnit"("ref");

-- CreateIndex
CREATE INDEX "OrderUnit_orderId_idx" ON "OrderUnit"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventKey_key" ON "WebhookEvent"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionLot_campaignId_number_key" ON "ProductionLot"("campaignId", "number");

-- CreateIndex
CREATE INDEX "ProductionLotUnit_unitId_idx" ON "ProductionLotUnit"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionLotUnit_lotId_unitId_key" ON "ProductionLotUnit"("lotId", "unitId");

-- CreateIndex
CREATE INDEX "EmailOutbox_orderId_idx" ON "EmailOutbox"("orderId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_clubId_createdAt_idx" ON "AuditLog"("clubId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubSport" ADD CONSTRAINT "ClubSport_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubSport" ADD CONSTRAINT "ClubSport_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPhoto" ADD CONSTRAINT "ClubPhoto_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Garment" ADD CONSTRAINT "Garment_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarmentSize" ADD CONSTRAINT "GarmentSize_garmentId_fkey" FOREIGN KEY ("garmentId") REFERENCES "Garment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductComponent" ADD CONSTRAINT "ProductComponent_garmentId_fkey" FOREIGN KEY ("garmentId") REFERENCES "Garment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitRule" ADD CONSTRAINT "BenefitRule_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitSettlement" ADD CONSTRAINT "BenefitSettlement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Buyer" ADD CONSTRAINT "Buyer_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderUnit" ADD CONSTRAINT "OrderUnit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderUnit" ADD CONSTRAINT "OrderUnit_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderUnit" ADD CONSTRAINT "OrderUnit_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderUnitComponent" ADD CONSTRAINT "OrderUnitComponent_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "OrderUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionLot" ADD CONSTRAINT "ProductionLot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionLotUnit" ADD CONSTRAINT "ProductionLotUnit_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "ProductionLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionLotUnit" ADD CONSTRAINT "ProductionLotUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "OrderUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
