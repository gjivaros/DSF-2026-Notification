-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('active', 'suspended');

-- Replace isActive with status, keeping existing values
ALTER TABLE "Application" ADD COLUMN "status" "ApplicationStatus" NOT NULL DEFAULT 'active';
UPDATE "Application" SET "status" = 'suspended' WHERE "isActive" = false;
ALTER TABLE "Application" DROP COLUMN "isActive";

-- Webhook secret is optional, but always set together with the webhook URL
ALTER TABLE "Application" ALTER COLUMN "webhookSecret" DROP NOT NULL;
ALTER TABLE "Application" ADD CONSTRAINT "Application_webhook_pair_check"
  CHECK (("webhookUrl" IS NULL) = ("webhookSecret" IS NULL));

-- CreateTable
CREATE TABLE "ApplicationStatusHistory" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL,
    "reason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationStatusHistory_applicationId_changedAt_idx" ON "ApplicationStatusHistory"("applicationId", "changedAt");

-- AddForeignKey
ALTER TABLE "ApplicationStatusHistory" ADD CONSTRAINT "ApplicationStatusHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Initial history entry for existing applications
INSERT INTO "ApplicationStatusHistory" ("id", "applicationId", "status", "reason", "changedAt")
SELECT gen_random_uuid()::text, "id", "status", 'Initial status', "createdAt" FROM "Application";
