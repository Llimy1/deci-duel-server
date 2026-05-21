-- CreateTable
CREATE TABLE "DiaryRecord" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "soloRecordId" INTEGER NOT NULL,
    "emoji" TEXT NOT NULL,
    "comment" TEXT,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiaryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiaryRecord_userId_key" ON "DiaryRecord"("userId");

-- AddForeignKey
ALTER TABLE "DiaryRecord" ADD CONSTRAINT "DiaryRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryRecord" ADD CONSTRAINT "DiaryRecord_soloRecordId_fkey" FOREIGN KEY ("soloRecordId") REFERENCES "SoloRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
