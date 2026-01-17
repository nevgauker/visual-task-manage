"use client";

type Tab = { id: string; label: string };

const defaultTabs: Tab[] = [
  { id: "in", label: "In" },
  { id: "do", label: "Do" },
  { id: "out", label: "Out" },
];

export default function TabBar({
  tabs = defaultTabs,
  activeId,
  onSelect,
}: {
  tabs?: Tab[];
  activeId?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200/70 bg-white/90 text-zinc-900 backdrop-blur-md">
      <div className="flex h-16 items-center px-2 pb-[max(8px,env(safe-area-inset-bottom))]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSelect?.(tab.id)}
            className={[
              "flex flex-1 flex-col items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition active:scale-95",
              activeId === tab.id
                ? "text-zinc-900"
                : "text-zinc-500 hover:text-zinc-700",
            ].join(" ")}
            type="button"
          >
            <span
              className={[
                "inline-block h-[2px] w-7 rounded-full",
                activeId === tab.id ? "bg-red-500" : "bg-zinc-200",
              ].join(" ")}
            />
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
