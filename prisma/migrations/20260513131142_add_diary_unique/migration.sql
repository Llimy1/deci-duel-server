/*
  Warnings:

  - A unique constraint covering the columns `[userId,date]` on the table `DiaryRecord` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "DiaryRecord_userId_date_key" ON "DiaryRecord"("userId", "date");
