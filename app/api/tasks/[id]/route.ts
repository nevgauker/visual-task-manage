import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/app/lib/prisma";
import { ensureUser } from "@/app/lib/ensure-user";
import { applyCompletionReward, recordDelegationEvent } from "@/app/lib/gamification";

type RouteContext = {
  params: { id: string } | Promise<{ id: string }>;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await ensureUser(userId);

  const task = await prisma.task.findUnique({
    where: { id },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const isOwner = task.ownerId === userId;
  const isDelegate = task.delegateToId === userId;

  const body = (await request.json()) as {
    action?: "complete" | "delegate" | "accept" | "decline" | "status" | "position";
    delegateToId?: string;
    recipientEmail?: string;
    status?: string;
    posX?: number;
    posY?: number;
  };

  if (body.action === "position") {
    if (!isOwner && !isDelegate) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (typeof body.posX !== "number" || typeof body.posY !== "number") {
      return NextResponse.json(
        { error: "Position is required." },
        { status: 400 }
      );
    }

    const posX = clamp(body.posX, 0.05, 0.95);
    const posY = clamp(body.posY, 0.05, 0.95);

    try {
      await prisma.taskPosition.upsert({
        where: { taskId_userId: { taskId: task.id, userId } },
        update: { posX, posY },
        create: { taskId: task.id, userId, posX, posY },
      });
    } catch {
      // Optional schema: ignore if the table doesn't exist yet.
    }

    return NextResponse.json({ ok: true, posX, posY });
  }

  if (body.action === "complete") {
    if (!isOwner && !isDelegate) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const pendingDelegation =
      task.status === "OUT" &&
      task.delegateToId &&
      task.delegationStatus !== "ACCEPTED";
    if (!isOwner && pendingDelegation) {
      return NextResponse.json(
        { error: "Accept the task before completing it." },
        { status: 403 }
      );
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "IN",
        delegateToId: null,
        recipientEmail: null,
        delegationStatus: null,
        completedAt: new Date(),
      },
    });

    await applyCompletionReward({
      userId,
      taskId: task.id,
      ownerId: task.ownerId,
      effort: task.effort ?? undefined,
      priority: task.priority ?? undefined,
      wasDelegated: Boolean(task.delegateToId),
    });

    return NextResponse.json(updated);
  }

  if (body.action === "delegate") {
    if (!isOwner) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const delegateToId = body.delegateToId?.trim();
    const recipientEmail = body.recipientEmail?.trim();

    if (!delegateToId || !recipientEmail) {
      return NextResponse.json(
        { error: "Delegate user is required." },
        { status: 400 }
      );
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "OUT",
        delegateToId,
        recipientEmail,
        delegationStatus: "PENDING",
        completedAt: null,
      },
    });

    await recordDelegationEvent(userId, task.id);

    return NextResponse.json(updated);
  }

  if (body.action === "accept") {
    if (!isDelegate) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (task.status !== "OUT") {
      return NextResponse.json(
        { error: "Task is not pending delegation." },
        { status: 400 }
      );
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "DO",
        delegationStatus: "ACCEPTED",
      },
    });

    await prisma.taskEvent.create({
      data: {
        taskId: task.id,
        actorId: userId,
        type: "accepted",
      },
    });

    return NextResponse.json(updated);
  }

  if (body.action === "decline") {
    if (!isDelegate) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (task.status !== "OUT") {
      return NextResponse.json(
        { error: "Task is not pending delegation." },
        { status: 400 }
      );
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "OUT",
        delegateToId: null,
        recipientEmail: null,
        delegationStatus: "DECLINED",
      },
    });

    await prisma.taskEvent.create({
      data: {
        taskId: task.id,
        actorId: userId,
        type: "declined",
      },
    });

    return NextResponse.json(updated);
  }

  if (body.action === "status") {
    if (!isOwner && !isDelegate) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (task.delegateToId) {
      return NextResponse.json(
        { error: "Delegated tasks stay in Do until completion." },
        { status: 403 }
      );
    }

    const nextStatus = body.status?.toUpperCase();
    if (nextStatus !== "IN" && nextStatus !== "DO" && nextStatus !== "OUT") {
      return NextResponse.json(
        { error: "Invalid status." },
        { status: 400 }
      );
    }

    if (nextStatus === "OUT" && !isOwner) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: nextStatus as "IN" | "DO" | "OUT",
      },
    });

    await prisma.taskEvent.create({
      data: {
        taskId: task.id,
        actorId: userId,
        type: "status",
        metadata: { status: nextStatus },
      },
    });

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await ensureUser(userId);

  const task = await prisma.task.findUnique({
    where: { id },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  if (task.ownerId !== userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await prisma.task.delete({ where: { id: task.id } });

  return NextResponse.json({ deleted: true });
}
