"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import BubbleBoard from "@/components/BubbleBoard";
import FloatingAddButton from "@/components/FloatingAddButton";
import TaskCreateModal from "@/components/TaskCreateModal";
import TabBar from "@/components/TabBar";

type Task = {
  id: string;
  title: string;
  status: "IN" | "DO" | "OUT";
  priority?: number | null;
  effort?: number | null;
  dueDate?: string | null;
  delegateToId?: string | null;
  recipientEmail?: string | null;
  delegationStatus?: "PENDING" | "ACCEPTED" | "DECLINED" | null;
  viewerRole?: "owner" | "delegate" | "viewer";
  posX?: number;
  posY?: number;
  category?: {
    id: string;
    name: string;
    color: string;
  } | null;
};

const FALLBACK_TASK_COLOR = "#f97316";

export default function Home() {
  const router = useRouter();
  const { user, isLoaded: isUserLoaded } = useUser();
  const [activeTab, setActiveTab] = useState<"in" | "do" | "out">("do");
  const [outScope, setOutScope] = useState<"all" | "owned" | "delegated">(
    "all"
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const positionOverridesRef = useRef(
    new Map<string, { posX: number; posY: number }>()
  );
  const saveTimeoutRef = useRef<number | null>(null);
  const lastScreenRef = useRef<string | null>(null);

  const storageKey = useMemo(() => {
    if (!isUserLoaded || !user?.id) return null;
    return `taskPositions:${user.id}`;
  }, [isUserLoaded, user?.id]);
  const [stats, setStats] = useState<{
    xp: number;
    level: number;
    streak: number;
  } | null>(null);
  const [recentAchievements, setRecentAchievements] = useState<
    { title: string; earnedAt: string }[]
  >([]);

  const screens: Record<
    typeof activeTab,
    { palette: string[]; surface: string }
  > = {
    in: {
      palette: [
        "#9ad3ff",
        "#8ed1c3",
        "#9fd3a2",
        "#b8d9ff",
        "#a7d8f0",
        "#97c7ff",
        "#b6e3d4",
        "#9bd1b6",
      ],
      surface: "bg-gradient-to-b from-sky-100 via-white to-sky-50",
    },
    do: {
      palette: [
        "#6fb6ff",
        "#79d0c1",
        "#f5b46a",
        "#6ccf8b",
        "#f29c9c",
        "#91c8ff",
        "#a6a1ff",
        "#f2c57a",
      ],
      surface: "bg-gradient-to-b from-sky-50 via-white to-sky-100",
    },
    out: {
      palette: [
        "#f29a9a",
        "#f4b16a",
        "#f6c87a",
        "#f3a0c6",
        "#c8b6ff",
        "#d6a7ff",
        "#f2b38f",
        "#f0b1b1",
      ],
      surface: "bg-gradient-to-b from-orange-50 via-white to-rose-50",
    },
  };

  const { palette, surface } = screens[activeTab];
  const loadTasks = useCallback(
    async (status: "IN" | "DO" | "OUT", scope?: string, signal?: AbortSignal) => {
      setIsLoadingTasks(true);
      try {
        const params = new URLSearchParams({ status });
        if (scope) {
          params.set("scope", scope);
        }
        const response = await fetch(`/api/tasks?${params.toString()}`, {
          signal,
        });
        if (!response.ok) {
          throw new Error("Failed to load tasks.");
        }
        const data = (await response.json()) as Task[];
        const screenKey = `${status}:${scope ?? "all"}`;
        if (lastScreenRef.current !== screenKey) {
          lastScreenRef.current = screenKey;
          const ids = new Set(data.map((task) => task.id));
          let pruned = false;
          for (const key of positionOverridesRef.current.keys()) {
            if (!ids.has(key)) {
              positionOverridesRef.current.delete(key);
              pruned = true;
            }
          }
          if (pruned) {
            persistPositions();
          }
        }
        const merged = data.map((task) => {
          const override = positionOverridesRef.current.get(task.id);
          return override ? { ...task, ...override } : task;
        });
        setTasks(merged);
      } catch {
        if (!signal?.aborted) {
          setTasks([]);
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoadingTasks(false);
        }
      }
    },
    []
  );

  const persistPositions = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!storageKey) return;
    const entries = Array.from(positionOverridesRef.current.entries());
    const payload = entries.reduce<Record<string, { posX: number; posY: number }>>(
      (acc, [id, pos]) => {
        acc[id] = pos;
        return acc;
      },
      {}
    );
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage failures (private mode, quota, etc.).
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storageKey) return;
    try {
      let raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        const legacy = window.localStorage.getItem("taskPositions");
        if (legacy) {
          window.localStorage.setItem(storageKey, legacy);
          window.localStorage.removeItem("taskPositions");
          raw = legacy;
        }
      }
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, { posX: number; posY: number }>;
      const entries = Object.entries(parsed).filter(
        ([, pos]) =>
          typeof pos?.posX === "number" && typeof pos?.posY === "number"
      );
      if (!entries.length) return;
      positionOverridesRef.current = new Map(entries);
      setTasks((prev) =>
        prev.map((task) => {
          const override = positionOverridesRef.current.get(task.id);
          return override ? { ...task, ...override } : task;
        })
      );
    } catch {
      // Ignore invalid cache.
    }
  }, [storageKey]);

  useEffect(() => {
    if (!isUserLoaded) return;
    if (!user?.id) {
      lastScreenRef.current = null;
      positionOverridesRef.current.clear();
    }
  }, [isUserLoaded, user?.id]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const savePosition = useCallback(async (id: string, posX: number, posY: number) => {
    positionOverridesRef.current.set(id, { posX, posY });
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, posX, posY } : task))
    );
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      persistPositions();
    }, 150);

    const delays = [0, 300, 800];
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt]) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
      try {
        const response = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "position", posX, posY }),
        });
        if (!response.ok) {
          throw new Error("Failed to save position.");
        }
        return;
      } catch {
        // Keep retrying; final failure is ignored to keep drag smooth.
      }
    }
  }, [persistPositions]);

  const loadStats = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/stats", { signal });
      if (!response.ok) {
        throw new Error("Failed to load stats.");
      }
      const data = (await response.json()) as {
        stats: { xp: number; level: number; streak: number } | null;
        achievements: { title: string; earnedAt: string }[];
      };
      if (!signal?.aborted && data.stats) {
        setStats(data.stats);
        setRecentAchievements(data.achievements.slice(0, 3));
      }
    } catch {
      if (!signal?.aborted) {
        setStats(null);
        setRecentAchievements([]);
      }
    }
  }, []);

  const activeStatus =
    activeTab === "in" ? "IN" : activeTab === "do" ? "DO" : "OUT";
  const scope =
    activeTab === "out"
      ? outScope === "all"
        ? "all"
        : outScope === "delegated"
        ? "delegated"
        : "owned"
      : activeTab === "do"
      ? "all"
      : "all";

  useEffect(() => {
    const controller = new AbortController();
    loadStats(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadStats]);

  useEffect(() => {
    const controller = new AbortController();
    loadTasks(activeStatus, scope, controller.signal);
    return () => {
      controller.abort();
    };
  }, [activeStatus, loadTasks, scope]);

  const now = useMemo(() => new Date(), []);

  const items = useMemo(
    () =>
      tasks.map((task) => {
        const effort = task.effort ?? 2;
        const radius = 38 + Math.max(0, Math.min(5, effort) - 1) * 8;
        const dueDate = task.dueDate ? new Date(task.dueDate) : null;
        const daysLeft = dueDate
          ? Math.ceil(
              (dueDate.getTime() - now.getTime()) / 86_400_000
            )
          : null;
        const glow =
          dueDate && daysLeft !== null
            ? daysLeft < 0
              ? "#f97316"
              : daysLeft <= 2
              ? "#f59e0b"
              : task.priority === 3
              ? "#f59e0b"
              : undefined
            : task.priority === 3
            ? "#f59e0b"
            : undefined;
        const effectiveDelegation =
          task.delegationStatus ?? (task.status === "OUT" ? "PENDING" : null);
        const tag =
          activeTab === "out"
            ? task.viewerRole === "owner" && effectiveDelegation
              ? effectiveDelegation
              : task.viewerRole === "delegate" && effectiveDelegation
              ? effectiveDelegation
              : task.delegateToId
              ? "Delegated"
              : undefined
            : task.viewerRole === "delegate" && effectiveDelegation
            ? effectiveDelegation
            : undefined;
        return {
          id: task.id,
          label: task.title,
          color: task.category?.color || FALLBACK_TASK_COLOR,
          radius,
          glow,
          tag,
          posX: task.posX,
          posY: task.posY,
        };
      }),
    [activeTab, now, tasks]
  );

  return (
    <main className="relative min-h-dvh bg-gradient-to-b from-sky-50 via-white to-sky-100 text-zinc-900 overflow-hidden">
      <FloatingAddButton onClick={() => setIsCreateOpen(true)} />

      <div className="absolute inset-0 pb-[120px]">
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-2">
          <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-2 text-xs font-semibold text-zinc-700 shadow-sm backdrop-blur">
            {stats ? (
              <span>
                Level {stats.level} · {stats.xp} XP · {stats.streak} streak
              </span>
            ) : (
              <span>Loading stats...</span>
            )}
          </div>
          {recentAchievements.length ? (
            <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-2 text-xs text-zinc-500 shadow-sm backdrop-blur">
              {recentAchievements.map((item) => item.title).join(" · ")}
            </div>
          ) : null}
        </div>

        {activeTab === "out" ? (
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 shadow-sm backdrop-blur">
            <button
              type="button"
              onClick={() => setOutScope("all")}
              className={outScope === "all" ? "text-zinc-900" : "text-zinc-400"}
            >
              All
            </button>
            <span className="text-zinc-300">/</span>
            <button
              type="button"
              onClick={() => setOutScope("owned")}
              className={
                outScope === "owned" ? "text-zinc-900" : "text-zinc-400"
              }
            >
              Mine
            </button>
            <span className="text-zinc-300">/</span>
            <button
              type="button"
              onClick={() => setOutScope("delegated")}
              className={
                outScope === "delegated" ? "text-zinc-900" : "text-zinc-400"
              }
            >
              To me
            </button>
          </div>
        ) : null}

        <BubbleBoard
          key={activeTab}
          palette={palette}
          items={items}
          surfaceClassName={surface}
          onBubbleClick={
            (id) => {
              router.push(`/tasks/${id}`);
            }
          }
          onPositionChange={savePosition}
        />
        {isLoadingTasks ? (
          <div className="pointer-events-none absolute inset-x-0 top-6 text-center text-xs text-zinc-400">
            Loading tasks...
          </div>
        ) : null}
        {!isLoadingTasks && items.length === 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-6 text-center text-xs text-zinc-400">
            No tasks yet. Tap + to add your first one.
          </div>
        ) : null}
      </div>

      <TabBar
        activeId={activeTab}
        onSelect={(id) => {
          if (id === "in" || id === "do" || id === "out") {
            setActiveTab(id);
          }
        }}
      />

      <TaskCreateModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => {
          loadTasks(activeStatus, scope);
          loadStats();
        }}
        defaultStatus={activeTab === "out" ? "OUT" : "DO"}
      />
    </main>
  );
}
