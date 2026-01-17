-- CreateTable
CREATE TABLE "TaskPosition" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL,
    "posY" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskPosition_taskId_userId_key" ON "TaskPosition"("taskId", "userId");

-- CreateIndex
CREATE INDEX "TaskPosition_userId_idx" ON "TaskPosition"("userId");

-- CreateIndex
CREATE INDEX "TaskPosition_taskId_idx" ON "TaskPosition"("taskId");

-- AddForeignKey
ALTER TABLE "TaskPosition" ADD CONSTRAINT "TaskPosition_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPosition" ADD CONSTRAINT "TaskPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
