import { prisma } from "@/app/lib/prisma";

const LEVEL_XP = 100;

const ACHIEVEMENTS = [
  {
    code: "first-complete",
    title: "First Complete",
    description: "Complete your first task.",
    points: 10,
  },
  {
    code: "first-delegate",
    title: "First Delegate",
    description: "Delegate a task to another user.",
    points: 10,
  },
  {
    code: "streak-7",
    title: "Seven Day Streak",
    description: "Complete tasks 7 days in a row.",
    points: 30,
  },
  {
    code: "inbox-zero",
    title: "Inbox Zero",
    description: "Clear all Do tasks.",
    points: 20,
  },
];

type CompletionRewardInput = {
  userId: string;
  taskId: string;
  ownerId: string;
  effort?: number | null;
  priority?: number | null;
  wasDelegated: boolean;
};

function xpToLevel(xp: number) {
  return Math.max(1, Math.floor(xp / LEVEL_XP) + 1);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function daysBetween(a: Date, b: Date) {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / 86_400_000);
}

async function ensureAchievements() {
  await Promise.all(
    ACHIEVEMENTS.map((achievement) =>
      prisma.achievement.upsert({
        where: { code: achievement.code },
        update: {
          title: achievement.title,
          description: achievement.description,
          points: achievement.points,
        },
        create: achievement,
      })
    )
  );
}

export async function ensureUserStats(userId: string) {
  return prisma.userStats.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
    },
  });
}

export async function getUserStatsSnapshot(userId: string) {
  await ensureAchievements();
  await ensureUserStats(userId);

  const [stats, achievements] = await Promise.all([
    prisma.userStats.findUnique({ where: { userId } }),
    prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
      orderBy: { earnedAt: "desc" },
    }),
  ]);

  return {
    stats,
    achievements: achievements.map((item) => ({
      code: item.achievement.code,
      title: item.achievement.title,
      description: item.achievement.description,
      points: item.achievement.points,
      earnedAt: item.earnedAt,
    })),
  };
}

export async function applyCompletionReward({
  userId,
  taskId,
  ownerId,
  effort,
  priority,
  wasDelegated,
}: CompletionRewardInput) {
  await ensureAchievements();

  const effortBonus = Math.max(0, (effort ?? 2) - 1) * 2;
  const priorityBonus = priority === 3 ? 4 : priority === 1 ? 0 : 2;
  const delegatedBonus = wasDelegated ? 5 : 0;
  const xpGain = 10 + effortBonus + priorityBonus + delegatedBonus;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const stats = await tx.userStats.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    let nextStreak = stats.streak;
    if (!stats.lastCompletedAt) {
      nextStreak = 1;
    } else {
      const diff = daysBetween(now, stats.lastCompletedAt);
      if (diff === 1) {
        nextStreak = stats.streak + 1;
      } else if (diff > 1) {
        nextStreak = 1;
      }
    }

    const nextXp = stats.xp + xpGain;
    const nextLevel = xpToLevel(nextXp);

    const updatedStats = await tx.userStats.update({
      where: { userId },
      data: {
        xp: nextXp,
        level: nextLevel,
        streak: nextStreak,
        lastCompletedAt: now,
      },
    });

    await tx.taskEvent.create({
      data: {
        taskId,
        actorId: userId,
        type: "completed",
        metadata: {
          xpGain,
          effort: effort ?? null,
          priority: priority ?? null,
          wasDelegated,
        },
      },
    });

    const completionCount = await tx.taskEvent.count({
      where: { actorId: userId, type: "completed" },
    });

    const ownerHasDo = await tx.task.count({
      where: { ownerId, status: "DO" },
    });

    const codesToAward = new Set<string>();
    if (completionCount === 1) {
      codesToAward.add("first-complete");
    }
    if (updatedStats.streak >= 7) {
      codesToAward.add("streak-7");
    }
    if (userId === ownerId && ownerHasDo === 0) {
      codesToAward.add("inbox-zero");
    }

    if (codesToAward.size) {
      const achievementMap = await tx.achievement.findMany({
        where: { code: { in: Array.from(codesToAward) } },
      });
      const byCode = new Map(
        achievementMap.map((item) => [item.code, item.id])
      );

      await tx.userAchievement.createMany({
        data: Array.from(codesToAward)
          .map((code) => byCode.get(code))
          .filter((id): id is string => Boolean(id))
          .map((id) => ({ userId, achievementId: id })),
        skipDuplicates: true,
      });
    }

    return { stats: updatedStats, xpGain };
  });
}

export async function recordDelegationEvent(userId: string, taskId: string) {
  await ensureAchievements();

  return prisma.$transaction(async (tx) => {
    await tx.taskEvent.create({
      data: {
        taskId,
        actorId: userId,
        type: "delegated",
      },
    });

    const count = await tx.taskEvent.count({
      where: { actorId: userId, type: "delegated" },
    });

    if (count === 1) {
      const achievement = await tx.achievement.findUnique({
        where: { code: "first-delegate" },
      });
      if (achievement) {
        await tx.userAchievement.createMany({
          data: [{ userId, achievementId: achievement.id }],
          skipDuplicates: true,
        });
      }
    }
  });
}
