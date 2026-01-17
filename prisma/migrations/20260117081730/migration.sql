-- DropForeignKey
ALTER TABLE "TaskPosition" DROP CONSTRAINT "TaskPosition_taskId_fkey";

-- DropForeignKey
ALTER TABLE "TaskPosition" DROP CONSTRAINT "TaskPosition_userId_fkey";

-- AddForeignKey
ALTER TABLE "TaskPosition" ADD CONSTRAINT "TaskPosition_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPosition" ADD CONSTRAINT "TaskPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
