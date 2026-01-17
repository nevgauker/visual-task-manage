import Link from "next/link";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import TaskActions from "@/components/TaskActions";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function TaskPage({ params }: Props) {
  const { userId } = await auth();
  if (!userId) {
    notFound();
  }

  const { id } = await params;
  const task = await prisma.task.findFirst({
    where: {
      id,
      OR: [{ ownerId: userId }, { delegateToId: userId }],
    },
    include: { category: true },
  });

  if (!task) {
    notFound();
  }

  const isOwner = task.ownerId === userId;
  const isDelegate = task.delegateToId === userId;
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const delegationLabel =
    task.delegationStatus ?? (task.status === "OUT" ? "PENDING" : null);

  let delegateName: string | null = null;
  if (task.delegateToId) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(task.delegateToId);
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
      const email = user.emailAddresses[0]?.emailAddress;
      delegateName = name || email || task.delegateToId;
    } catch {
      delegateName = task.delegateToId;
    }
  }

  return (
    <main className="min-h-dvh bg-gradient-to-b from-sky-50 via-white to-sky-100 text-zinc-900">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pb-16 pt-10">
        <header className="flex flex-col gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400 transition hover:text-zinc-600"
          >
            <span className="text-base">←</span>
            Back
          </Link>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Task Information
          </span>
          <h1 className="text-2xl font-semibold text-zinc-900">
            {task.title}
          </h1>
        </header>

        <section className="flex flex-col gap-3 rounded-3xl border border-zinc-200/70 bg-white/90 p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Details
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
              Status: {task.status}
            </span>
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
              Priority: {task.priority ?? 2}
            </span>
            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
              Effort: {task.effort ?? 2}
            </span>
            {dueDate ? (
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
                Due: {dueDate.toLocaleDateString()}
              </span>
            ) : null}
            {task.category ? (
              <span className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: task.category.color }}
                />
                {task.category.name}
              </span>
            ) : (
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-400">
                No category
              </span>
            )}
          </div>
          <div className="text-sm text-zinc-600">
            {task.description || "No description provided."}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-3xl border border-zinc-200/70 bg-white/90 p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Delegation
          </div>
          <div className="text-sm text-zinc-600">
            {task.recipientEmail || "No recipient email."}
          </div>
          <div className="text-xs text-zinc-400">
            Delegate: {delegateName || "Not assigned"}
          </div>
          {delegationLabel ? (
            <div className="text-xs text-zinc-400">
              Status: {delegationLabel}
            </div>
          ) : null}
        </section>

        {(isOwner || isDelegate) ? (
          <TaskActions
            taskId={task.id}
            isOwner={isOwner}
            isDelegate={isDelegate}
            status={task.status}
            delegationStatus={task.delegationStatus ?? null}
            isDelegated={Boolean(task.delegateToId)}
          />
        ) : null}
      </div>
    </main>
  );
}
