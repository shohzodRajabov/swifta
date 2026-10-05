-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "require2faForAdmins" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ServiceContract" ADD COLUMN     "slaBusinessHours" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "otpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpSecret" TEXT;

