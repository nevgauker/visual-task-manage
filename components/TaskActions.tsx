"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

type UserSummary = {
  id: string;
  email: string;
  name: string;
};

type Props = {
  taskId: string;
  isOwner: boolean;
  isDelegate: boolean;
  status: "IN" | "DO" | "OUT";
  delegationStatus?: "PENDING" | "ACCEPTED" | "DECLINED" | null;
  isDelegated?: boolean;
};

export default function TaskActions({
  taskId,
  isOwner,
  isDelegate,
  status,
  delegationStatus,
  isDelegated = false,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDelegating, setIsDelegating] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [showDelegate, setShowDelegate] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userMatches, setUserMatches] = useState<UserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const { showToast } = useToast();

  const canComplete = isOwner || isDelegate;
  const effectiveDelegationStatus = delegationStatus ?? "PENDING";
  const canRespond =
    isDelegate && status === "OUT" && effectiveDelegationStatus === "PENDING";
  const canUpdateStatus =
    isOwner && !isDelegated && status !== "OUT";

  useEffect(() => {
    if (!showDelegate) {
      setRecipientEmail("");
      setUserQuery("");
      setUserMatches([]);
      setSelectedUser(null);
      setError(null);
    }
  }, [showDelegate]);

  useEffect(() => {
    if (!showDelegate) return;
    const trimmed = userQuery.trim();
    if (!trimmed) {
      setUserMatches([]);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setIsLoadingUsers(true);
      try {
        const response = await fetch(
          `/api/users?query=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error("Failed to load users.");
        }
        const data = (await response.json()) as UserSummary[];
        if (!controller.signal.aborted) {
          setUserMatches(data);
        }
      } catch {
        if (!controller.signal.aborted) {
          setUserMatches([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingUsers(false);
        }
      }
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [showDelegate, userQuery]);

  const handleComplete = async () => {
    if (!canComplete || isCompleting) return;
    setIsCompleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to complete task.");
      }
      showToast({ message: "Task completed. Nice work!", variant: "success" });
      router.push("/");
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to complete task.";
      setError(message);
      showToast({ message, variant: "error" });
    } finally {
      setIsCompleting(false);
    }
  };

  const handleDelete = async () => {
    if (!isOwner || isDeleting) return;
    if (!window.confirm("Delete this task?")) return;
    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to delete task.");
      }
      showToast({ message: "Task deleted.", variant: "success" });
      router.push("/");
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete task.";
      setError(message);
      showToast({ message, variant: "error" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelegate = async () => {
    if (!isOwner || isDelegating) return;
    setIsDelegating(true);
    setError(null);

    try {
      let resolved = selectedUser;
      if (!resolved) {
        const response = await fetch(
          `/api/users?query=${encodeURIComponent(recipientEmail.trim())}`
        );
        if (!response.ok) {
          throw new Error("Failed to resolve user.");
        }
        const users = (await response.json()) as UserSummary[];
        const match = users.find(
          (user) =>
            user.email.toLowerCase() === recipientEmail.trim().toLowerCase()
        );
        if (!match) {
          throw new Error("Select a user from the list.");
        }
        resolved = match;
      }

      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delegate",
          delegateToId: resolved.id,
          recipientEmail: resolved.email,
        }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to delegate task.");
      }
      setShowDelegate(false);
      showToast({ message: "Task delegated.", variant: "success" });
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delegate task.";
      setError(message);
      showToast({ message, variant: "error" });
    } finally {
      setIsDelegating(false);
    }
  };

  const handleRespond = async (action: "accept" | "decline") => {
    if (!canRespond || isResponding) return;
    setIsResponding(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to update task.");
      }
      if (action === "accept") {
        showToast({
          message: "Task accepted. It is now in Do.",
          variant: "success",
        });
      } else {
        showToast({ message: "Task declined.", variant: "success" });
      }
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update task.";
      setError(message);
      showToast({ message, variant: "error" });
    } finally {
      setIsResponding(false);
    }
  };

  const handleStatusChange = async (nextStatus: "IN" | "DO") => {
    if (!canUpdateStatus || isUpdatingStatus) return;
    if (nextStatus === status) return;
    setIsUpdatingStatus(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", status: nextStatus }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to update status.");
      }
      showToast({
        message: `Moved to ${nextStatus === "IN" ? "In" : "Do"}.`,
        variant: "success",
      });
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update status.";
      setError(message);
      showToast({ message, variant: "error" });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-zinc-200/70 bg-white/90 p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
        Actions
      </div>
      {canRespond ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleRespond("accept")}
            disabled={isResponding}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:opacity-60"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => handleRespond("decline")}
            disabled={isResponding}
            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-300 disabled:opacity-60"
          >
            Decline
          </button>
        </div>
      ) : null}

      {canUpdateStatus ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleStatusChange("IN")}
            disabled={isUpdatingStatus}
            className="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 disabled:opacity-60"
          >
            Move to In
          </button>
          <button
            type="button"
            onClick={() => handleStatusChange("DO")}
            disabled={isUpdatingStatus}
            className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 transition hover:border-amber-300 disabled:opacity-60"
          >
            Move to Do
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canComplete ? (
          <button
            type="button"
            onClick={handleComplete}
            disabled={isCompleting}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:opacity-60"
          >
            {isCompleting ? "Completing..." : "Complete"}
          </button>
        ) : null}
        {isOwner ? (
          <button
            type="button"
            onClick={() => setShowDelegate((prev) => !prev)}
            className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 transition hover:border-sky-300"
          >
            Delegate
          </button>
        ) : null}
        {isOwner ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-300 disabled:opacity-60"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        ) : null}
      </div>

      {showDelegate ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-sm text-zinc-600">
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Send to
            <input
              type="email"
              placeholder="name@email.com"
              value={recipientEmail}
              onChange={(event) => {
                const value = event.target.value;
                setRecipientEmail(value);
                setUserQuery(value);
                setSelectedUser(null);
              }}
              className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:border-sky-300 focus:outline-none"
            />
          </label>

          {selectedUser ? (
            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
              <span className="font-semibold">Selected</span>
              <span className="text-emerald-800">{selectedUser.name}</span>
              <span className="text-emerald-600">{selectedUser.email}</span>
            </div>
          ) : null}

          <div className="rounded-2xl border border-zinc-200/80 bg-white/80 px-3 py-2 text-xs text-zinc-500">
            {isLoadingUsers
              ? "Searching users..."
              : userMatches.length
              ? "Select a user below."
              : "No matches yet."}
          </div>

          {userMatches.length ? (
            <div className="max-h-40 overflow-auto rounded-2xl border border-zinc-200/80 bg-white text-sm text-zinc-700 shadow-sm">
              {userMatches.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-zinc-50"
                  onClick={() => {
                    setRecipientEmail(user.email);
                    setSelectedUser(user);
                    setUserQuery(user.email);
                    setUserMatches([]);
                  }}
                >
                  <span className="font-medium">{user.name}</span>
                  <span className="text-xs text-zinc-400">{user.email}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelegate}
              disabled={isDelegating}
              className="rounded-full border border-sky-200 bg-sky-100 px-4 py-2 text-xs font-semibold text-sky-700 transition hover:border-sky-300 disabled:opacity-60"
            >
              {isDelegating ? "Delegating..." : "Confirm delegate"}
            </button>
            <button
              type="button"
              onClick={() => setShowDelegate(false)}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600">
          {error}
        </div>
      ) : null}
    </section>
  );
}
