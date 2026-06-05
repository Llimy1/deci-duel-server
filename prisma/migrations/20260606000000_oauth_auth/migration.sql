-- Add provider identity for OAuth accounts and migrate existing dev accounts.
ALTER TABLE "User" ADD COLUMN "provider_id" TEXT;

UPDATE "User"
SET "provider_id" = CASE
  WHEN "auth_provider" = 'dev' AND "dev_id" IS NOT NULL THEN "dev_id"
  ELSE CONCAT('legacy-', "id"::text)
END
WHERE "provider_id" IS NULL;

ALTER TABLE "User" ALTER COLUMN "provider_id" SET NOT NULL;

ALTER TABLE "User" DROP COLUMN "dev_id";
ALTER TABLE "User" DROP COLUMN "dev_password";

CREATE UNIQUE INDEX "User_auth_provider_provider_id_key" ON "User"("auth_provider", "provider_id");
