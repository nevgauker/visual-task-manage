"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  defaultStatus?: "IN" | "DO" | "OUT";
};

type Category = {
  id: string;
  name: string;
  color: string;
};

type UserSummary = {
  id: string;
  email: string;
  name: string;
};

export default function TaskCreateModal({
  open,
  onClose,
  onCreated,
  defaultStatus = "DO",
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"IN" | "DO" | "OUT">(defaultStatus);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [delegateToId, setDelegateToId] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [userMatches, setUserMatches] = useState<UserSummary[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryMode, setCategoryMode] = useState<"existing" | "new">(
    "existing"
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#f97316");
  const [priority, setPriority] = useState(2);
  const [effort, setEffort] = useState(2);
  const [dueDate, setDueDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setStatus(defaultStatus === "OUT" ? "OUT" : "DO");
      setRecipientEmail("");
      setDelegateToId("");
      setSelectedUser(null);
      setUserQuery("");
      setUserMatches([]);
      setCategoryMode("existing");
      setSelectedCategoryId("");
      setNewCategoryName("");
      setNewCategoryColor("#f97316");
      setPriority(2);
      setEffort(2);
      setDueDate("");
      setError(null);
    }
  }, [open, defaultStatus]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const loadCategories = async () => {
      setIsLoadingCategories(true);
      try {
        const response = await fetch("/api/categories");
        if (!response.ok) {
          throw new Error("Failed to load categories.");
        }
        const data = (await response.json()) as Category[];
        if (!cancelled) {
          setCategories(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load categories.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCategories(false);
        }
      }
    };

    loadCategories();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    [categories]
  );

  useEffect(() => {
    if (status !== "OUT") {
      setRecipientEmail("");
      setDelegateToId("");
      setSelectedUser(null);
      setUserQuery("");
      setUserMatches([]);
    }
  }, [status]);

  useEffect(() => {
    if (!open || status !== "OUT") return;
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
  }, [open, status, userQuery]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    if (status === "OUT" && !recipientEmail.trim()) {
      setError("Recipient email is required for Out tasks.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      let resolvedDelegateToId = delegateToId || undefined;

      if (status === "OUT" && !resolvedDelegateToId) {
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
          setError("Select a user from the list.");
          setIsSaving(false);
          return;
        }
        resolvedDelegateToId = match.id;
        setDelegateToId(match.id);
        setSelectedUser(match);
      }

      let categoryId: string | undefined;
      if (categoryMode === "existing") {
        categoryId = selectedCategoryId || undefined;
      } else {
        if (!newCategoryName.trim()) {
          setError("Category name is required.");
          setIsSaving(false);
          return;
        }

        const categoryResponse = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newCategoryName,
            color: newCategoryColor,
          }),
        });

        if (!categoryResponse.ok) {
          const data = (await categoryResponse.json()) as { error?: string };
          throw new Error(data.error || "Failed to create category.");
        }

        const created = (await categoryResponse.json()) as Category;
        categoryId = created.id;
      }

      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          status,
          recipientEmail: status === "OUT" ? recipientEmail : undefined,
          categoryId,
          delegateToId: status === "OUT" ? resolvedDelegateToId : undefined,
          dueDate: dueDate || undefined,
          priority,
          effort,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to create task.");
      }

      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative flex min-h-dvh flex-col bg-gradient-to-b from-sky-50 via-white to-sky-100 text-zinc-900">
        <div className="flex items-center justify-between px-5 pt-6 pb-4">
          <button
            type="button"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
            onClick={onClose}
          >
            Cancel
          </button>
          <div className="text-sm font-semibold tracking-tight">New Task</div>
          <button
            type="button"
            className="text-sm font-semibold text-red-500 hover:text-red-600 disabled:text-red-300/70"
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="flex-1 min-h-0 px-5 pb-[max(96px,env(safe-area-inset-bottom))]">
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit();
            }}
          >
            <label className="flex flex-col gap-2 text-sm font-medium text-zinc-500">
              Title
              <input
                type="text"
                placeholder="Task title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:border-red-300 focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-zinc-500">
              Description
              <textarea
                placeholder="Add details"
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="resize-none rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:border-red-300 focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-zinc-500">
              Status
              <select
                className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm focus:border-red-300 focus:outline-none"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "IN" | "DO" | "OUT")
                }
              >
                <option value="DO">Do</option>
                <option value="OUT">Out</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-2 text-sm font-medium text-zinc-500">
                Priority
                <select
                  className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm focus:border-red-300 focus:outline-none"
                  value={priority}
                  onChange={(event) =>
                    setPriority(Number(event.target.value))
                  }
                >
                  <option value={1}>Low</option>
                  <option value={2}>Medium</option>
                  <option value={3}>High</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-zinc-500">
                Effort
                <select
                  className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm focus:border-red-300 focus:outline-none"
                  value={effort}
                  onChange={(event) =>
                    setEffort(Number(event.target.value))
                  }
                >
                  <option value={1}>XS</option>
                  <option value={2}>S</option>
                  <option value={3}>M</option>
                  <option value={4}>L</option>
                  <option value={5}>XL</option>
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm font-medium text-zinc-500">
              Due date
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm focus:border-red-300 focus:outline-none"
              />
            </label>

            <div className="flex flex-col gap-2 text-sm font-medium text-zinc-500">
              Category
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCategoryMode("existing")}
                  className={[
                    "rounded-full border px-3 py-1 text-xs font-semibold",
                    categoryMode === "existing"
                      ? "border-red-200 bg-red-50 text-red-600"
                      : "border-zinc-200 bg-white text-zinc-500",
                  ].join(" ")}
                >
                  Existing
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryMode("new")}
                  className={[
                    "rounded-full border px-3 py-1 text-xs font-semibold",
                    categoryMode === "new"
                      ? "border-red-200 bg-red-50 text-red-600"
                      : "border-zinc-200 bg-white text-zinc-500",
                  ].join(" ")}
                >
                  New
                </button>
              </div>

              {categoryMode === "existing" ? (
                <select
                  className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-base text-zinc-900 shadow-sm focus:border-red-300 focus:outline-none"
                  value={selectedCategoryId}
                  onChange={(event) => setSelectedCategoryId(event.target.value)}
                  disabled={isLoadingCategories}
                >
                  <option value="">
                    {isLoadingCategories ? "Loading..." : "No category"}
                  </option>
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    placeholder="Category name"
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:border-red-300 focus:outline-none"
                  />
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={newCategoryColor}
                      onChange={(event) => setNewCategoryColor(event.target.value)}
                      className="h-10 w-14 cursor-pointer rounded-xl border border-zinc-200/80 bg-white p-1"
                      aria-label="Category color"
                    />
                    <span className="text-xs text-zinc-400">
                      Pick a color
                    </span>
                  </div>
                </div>
              )}
            </div>

            {status === "OUT" ? (
              <label className="flex flex-col gap-2 text-sm font-medium text-zinc-500">
                Send to
                <input
                  type="email"
                  placeholder="name@email.com"
                  value={recipientEmail}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRecipientEmail(value);
                    setUserQuery(value);
                    setDelegateToId("");
                    setSelectedUser(null);
                  }}
                  className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:border-red-300 focus:outline-none"
                />
                {selectedUser ? (
                  <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                    <span className="font-semibold">Selected</span>
                    <span className="text-emerald-800">{selectedUser.name}</span>
                    <span className="text-emerald-600">
                      {selectedUser.email}
                    </span>
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
                          setDelegateToId(user.id);
                          setSelectedUser(user);
                          setUserQuery(user.email);
                          setUserMatches([]);
                        }}
                      >
                        <span className="font-medium">{user.name}</span>
                        <span className="text-xs text-zinc-400">
                          {user.email}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600">
                {error}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
