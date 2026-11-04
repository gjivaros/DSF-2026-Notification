-- CreateEnum
CREATE TYPE "Operator" AS ENUM ('MTN', 'MOOV', 'CELTIIS');

-- CreateEnum
CREATE TYPE "SmsCategory" AS ENUM ('OTP', 'INFO');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('pending', 'transmitted', 'delivered', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "FailureReason" AS ENUM ('ECHEC_TEMPORAIRE', 'ECHEC_DEFINITIF', 'ECHEC_OPERATEUR');

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "dailyQuota" INTEGER NOT NULL,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "segments" INTEGER NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "reference" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sms" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "campaignId" TEXT,
    "recipient" TEXT NOT NULL,
    "operator" "Operator" NOT NULL,
    "category" "SmsCategory" NOT NULL,
    "text" TEXT,
    "isUnicode" BOOLEAN NOT NULL,
    "length" INTEGER NOT NULL,
    "segments" INTEGER NOT NULL,
    "status" "SmsStatus" NOT NULL DEFAULT 'pending',
    "failureReason" "FailureReason",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "manualRetries" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "sendAt" TIMESTAMP(3) NOT NULL,
    "operatorMessageId" TEXT,
    "transmittedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotaUsage" (
    "applicationId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "usedSegments" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuotaUsage_pkey" PRIMARY KEY ("applicationId","day")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "applicationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("applicationId","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Application_code_key" ON "Application"("code");

-- CreateIndex
CREATE INDEX "Campaign_applicationId_createdAt_idx" ON "Campaign"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sms_operatorMessageId_key" ON "Sms"("operatorMessageId");

-- CreateIndex
CREATE INDEX "Sms_applicationId_createdAt_idx" ON "Sms"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "Sms_campaignId_status_idx" ON "Sms"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Sms_status_operator_idx" ON "Sms"("status", "operator");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sms" ADD CONSTRAINT "Sms_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sms" ADD CONSTRAINT "Sms_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotaUsage" ADD CONSTRAINT "QuotaUsage_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
