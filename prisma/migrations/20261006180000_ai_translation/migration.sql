-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "aiApiKey" TEXT,
ADD COLUMN     "aiAutoTranslate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "aiProvider" TEXT NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "TextTranslation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TextTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TextTranslation_companyId_hash_locale_key" ON "TextTranslation"("companyId", "hash", "locale");

-- AddForeignKey
ALTER TABLE "TextTranslation" ADD CONSTRAINT "TextTranslation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

