"use client";

type Props = {
  onClick?: () => void;
};

export default function FloatingAddButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="fixed right-4 top-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-2xl font-semibold text-white shadow-lg shadow-red-500/25 ring-1 ring-red-300/50 transition hover:bg-red-600 active:scale-95"
      aria-label="Add bubble"
      type="button"
    >
      +
    </button>
  );
}
