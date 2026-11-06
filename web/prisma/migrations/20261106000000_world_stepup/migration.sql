-- AlterTable
ALTER TABLE "User" ADD COLUMN     "worldAuthIss" TEXT,
ADD COLUMN     "worldAuthSub" TEXT;

-- CreateTable
CREATE TABLE "StepUpAttempt" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "splitHash" TEXT,
    "splits" JSONB,
    "agentProposalId" TEXT,
    "boundIss" TEXT,
    "boundSub" TEXT,
    "allowEnroll" BOOLEAN NOT NULL DEFAULT false,
    "requiredAcr" JSONB NOT NULL,
    "maxAge" INTEGER NOT NULL DEFAULT 0,
    "returnPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "failureDetail" TEXT,
    "iss" TEXT,
    "sub" TEXT,
    "acr" TEXT,
    "amr" JSONB,
    "authTime" TIMESTAMP(3),
    "tokenJti" TEXT,
    "codeRedeemedAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "authorizedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StepUpAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StepUpAttempt_state_key" ON "StepUpAttempt"("state");

-- CreateIndex
CREATE INDEX "StepUpAttempt_userId_campaignId_status_idx" ON "StepUpAttempt"("userId", "campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_worldAuthIss_worldAuthSub_key" ON "User"("worldAuthIss", "worldAuthSub");
