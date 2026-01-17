import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/app/lib/prisma";
import { ensureUser } from "@/app/lib/ensure-user";
import { recordDelegationEvent } from "@/app/lib/gamification";

const allowedStatus = new Set(["IN", "DO", "OUT"]);
const POSITION_MIN = 0.2;
const POSITION_RANGE = 0.6;

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const hashToUnit = (value: string) => hashString(value) / 4294967295;

const fallbackPosition = (userId: string, taskId: string) => ({
  posX: POSITION_MIN + hashToUnit(`${userId}:${taskId}:x`) * POSITION_RANGE,
  posY: POSITION_MIN + hashToUnit(`${userId}:${taskId}:y`) * POSITION_RANGE,
});

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await ensureUser(userId);

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status")?.toUpperCase();
  const scope = searchParams.get("scope")?.toLowerCase();
  if (statusParam && !allowedStatus.has(statusParam)) {
    return NextResponse.json(
      { error: "Invalid status filter." },
      { status: 400 }
    );
  }

  const status = statusParam as "IN" | "DO" | "OUT" | undefined;
  let where: Record<string, unknown> | undefined;
  const delegatedPending = {
    delegateToId: userId,
    status: "OUT",
    delegationStatus: "PENDING",
  };

  if (scope === "delegated") {
    if (status === "DO") {
      where = {
        delegateToId: userId,
        status: "DO",
        delegationStatus: "ACCEPTED",
      };
    } else if (status === "IN") {
      where = delegatedPending;
    } else if (status === "OUT") {
      return NextResponse.json([]);
    } else {
      where = { delegateToId: userId, status };
    }
  } else if (scope === "owned") {
    if (status === "OUT") {
      where = {
        ownerId: userId,
        OR: [{ status: "OUT" }, { delegateToId: { not: null } }],
      };
    } else {
      where = { ownerId: userId, status, delegateToId: null };
    }
  } else {
    if (status === "DO") {
      where = {
        OR: [
          { ownerId: userId, status: "DO", delegateToId: null },
          {
            delegateToId: userId,
            status: "DO",
            delegationStatus: "ACCEPTED",
          },
        ],
      };
    } else if (status === "IN") {
      where = {
        OR: [
          { ownerId: userId, status: "IN", delegateToId: null },
          delegatedPending,
        ],
      };
    } else if (status === "OUT") {
      where = {
        ownerId: userId,
        OR: [{ status: "OUT" }, { delegateToId: { not: null } }],
      };
    } else {
      where = { ownerId: userId, status, delegateToId: null };
    }
  }

  const tasks = await prisma.task.findMany({
    where: {
      ...(where ?? {}),
    },
    include: { category: true },
    orderBy: { createdAt: "desc" },
  });
  let positionByTaskId = new Map<string, { posX: number; posY: number }>();
  try {
    const rows = await prisma.taskPosition.findMany({
      where: { userId, taskId: { in: tasks.map((task) => task.id) } },
      select: { taskId: true, posX: true, posY: true },
    });
    positionByTaskId = new Map(
      rows.map((row) => [row.taskId, { posX: row.posX, posY: row.posY }])
    );
  } catch {
    positionByTaskId = new Map();
  }

  const withRole = tasks.map((task) => {
    const position =
      positionByTaskId.get(task.id) ?? fallbackPosition(userId, task.id);
    return {
    ...task,
    posX: position.posX,
    posY: position.posY,
    viewerRole:
      task.ownerId === userId
        ? "owner"
        : task.delegateToId === userId
        ? "delegate"
        : "viewer",
    };
  });
  return NextResponse.json(withRole);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await ensureUser(userId);

  const body = (await request.json()) as {
    title?: string;
    description?: string;
    status?: string;
    recipientEmail?: string;
    categoryId?: string;
    delegateToId?: string;
    dueDate?: string;
    priority?: number;
    effort?: number;
  };

  const title = body.title?.trim();
  const description = body.description?.trim() || undefined;
  const status = body.status?.toUpperCase();
  const recipientEmail = body.recipientEmail?.trim() || undefined;
  const categoryId = body.categoryId?.trim() || undefined;
  const delegateToId = body.delegateToId?.trim() || undefined;
  const dueDate = body.dueDate ? new Date(body.dueDate) : undefined;
  const priority = body.priority ?? undefined;
  const effort = body.effort ?? undefined;

  if (!title) {
    return NextResponse.json(
      { error: "Title is required." },
      { status: 400 }
    );
  }

  if (status && !allowedStatus.has(status)) {
    return NextResponse.json(
      { error: "Invalid status." },
      { status: 400 }
    );
  }

  if (status === "OUT" && !recipientEmail) {
    return NextResponse.json(
      { error: "Recipient email is required for Out tasks." },
      { status: 400 }
    );
  }

  if (status === "OUT" && !delegateToId) {
    return NextResponse.json(
      { error: "Delegate user is required for Out tasks." },
      { status: 400 }
    );
  }

  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid due date." },
      { status: 400 }
    );
  }

  if (priority !== undefined && (priority < 1 || priority > 3)) {
    return NextResponse.json(
      { error: "Priority must be between 1 and 3." },
      { status: 400 }
    );
  }

  if (effort !== undefined && (effort < 1 || effort > 5)) {
    return NextResponse.json(
      { error: "Effort must be between 1 and 5." },
      { status: 400 }
    );
  }

  if (categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, ownerId: userId },
      select: { id: true },
    });
    if (!category) {
      return NextResponse.json(
        { error: "Invalid category." },
        { status: 400 }
      );
    }
  }

  const task = await prisma.task.create({
    data: {
      ownerId: userId,
      delegateToId,
      title,
      description,
      status: (status as "IN" | "DO" | "OUT") ?? "IN",
      recipientEmail,
      delegationStatus: status === "OUT" ? "PENDING" : undefined,
      dueDate,
      priority,
      effort,
      categoryId,
    },
  });

  if (status === "OUT" && delegateToId) {
    await recordDelegationEvent(userId, task.id);
  }

  return NextResponse.json(task, { status: 201 });
}
