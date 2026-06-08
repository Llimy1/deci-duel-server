-- CreateTable
CREATE TABLE "operational_events" (
    "id" SERIAL NOT NULL,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "message" TEXT,
    "userId" INTEGER,
    "request_id" TEXT,
    "room_code" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operational_events_level_created_at_idx" ON "operational_events"("level", "created_at");

-- CreateIndex
CREATE INDEX "operational_events_category_event_created_at_idx" ON "operational_events"("category", "event", "created_at");

-- CreateIndex
CREATE INDEX "operational_events_request_id_idx" ON "operational_events"("request_id");

-- CreateIndex
CREATE INDEX "operational_events_userId_created_at_idx" ON "operational_events"("userId", "created_at");
