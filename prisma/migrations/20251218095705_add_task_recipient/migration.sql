-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "recipientEmail" TEXT;

-- CreateIndex
CREATE INDEX "Task_recipientEmail_idx" ON "Task"("recipientEmail");
