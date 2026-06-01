/*
  Warnings:

  - You are about to drop the `user_consents` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "user_consents" DROP CONSTRAINT "user_consents_user_id_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "consented_at" TIMESTAMP(3),
ADD COLUMN     "privacy_version" TEXT,
ADD COLUMN     "terms_version" TEXT;

-- DropTable
DROP TABLE "user_consents";
