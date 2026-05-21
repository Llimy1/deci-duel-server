/*
  Warnings:

  - You are about to drop the column `soloRecordId` on the `DiaryRecord` table. All the data in the column will be lost.
  - Added the required column `peakDb` to the `DiaryRecord` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "DiaryRecord" DROP CONSTRAINT "DiaryRecord_soloRecordId_fkey";

-- AlterTable
ALTER TABLE "DiaryRecord" DROP COLUMN "soloRecordId",
ADD COLUMN     "peakDb" DOUBLE PRECISION NOT NULL;
