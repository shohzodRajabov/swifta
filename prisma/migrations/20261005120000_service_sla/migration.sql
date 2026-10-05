-- AlterTable
ALTER TABLE "ServiceTicket" ADD COLUMN     "planned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "respondedAt" TIMESTAMP(3);

