-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('POST', 'CAROUSEL', 'REEL', 'STORY');

-- CreateEnum
CREATE TYPE "ContentChannel" AS ENUM ('INSTAGRAM', 'MANUAL');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('IDEA', 'READY', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "ContentPost" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT 'beauty',
    "title" TEXT NOT NULL,
    "kind" "ContentKind" NOT NULL DEFAULT 'POST',
    "channel" "ContentChannel" NOT NULL DEFAULT 'INSTAGRAM',
    "status" "ContentStatus" NOT NULL DEFAULT 'IDEA',
    "scheduledAt" TIMESTAMP(3),
    "caption" TEXT NOT NULL DEFAULT '',
    "notes" TEXT,
    "igContainerId" TEXT,
    "igMediaId" TEXT,
    "permalink" TEXT,
    "publishedAt" TIMESTAMP(3),
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentMedia" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isVideo" BOOLEAN NOT NULL DEFAULT false,
    "key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentPost_status_scheduledAt_idx" ON "ContentPost"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "ContentPost_brand_scheduledAt_idx" ON "ContentPost"("brand", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentMedia_key_key" ON "ContentMedia"("key");

-- CreateIndex
CREATE INDEX "ContentMedia_postId_position_idx" ON "ContentMedia"("postId", "position");

-- AddForeignKey
ALTER TABLE "ContentMedia" ADD CONSTRAINT "ContentMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ContentPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
