/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `SoloRecord` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `bestDb` to the `SoloRecord` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SoloRecord" ADD COLUMN     "bestDb" DOUBLE PRECISION NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SoloRecord_userId_key" ON "SoloRecord"("userId");
