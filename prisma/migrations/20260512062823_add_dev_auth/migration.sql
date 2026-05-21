/*
  Warnings:

  - Added the required column `dev_id` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dev_password` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dev_id" TEXT NOT NULL,
ADD COLUMN     "dev_password" TEXT NOT NULL;
