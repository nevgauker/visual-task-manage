"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* =========================
   Types
========================= */

type Bubble = {
    id: string;
    label: string;
    color: string;
    tag?: string;
    glow?: string;
    x: number;
    y: number;
    nx: number;
    ny: number;
    r: number;
    vx: number;
    vy: number;
    z: number;
};

type PointerInfo = {
    x: number;
    y: number;
    startX: number;
    startY: number;
};

type BubbleItem = {
    id: string;
    label: string;
    color: string;
    radius?: number;
    tag?: string;
    glow?: string;
    posX?: number;
    posY?: number;
};

/* =========================
   Physics tuning
========================= */

const FRICTION = 0.92;
const MAX_VELOCITY = 28;
const WALL_SPRING = 0.6;
const COLLISION_PUSH = 0.55;
const DRAG_SENSITIVITY = 0.75;
const DRAG_IMPULSE = 0.4;
const BASE_WIDTH = 360;
const BASE_HEIGHT = 520;

/* =========================
   Helpers
========================= */

const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));

const dist = (ax: number, ay: number, bx: number, by: number) =>
    Math.hypot(ax - bx, ay - by);

/* =========================
   Initial data (UI only)
========================= */

const defaultLabels = [
    "Inbox",
    "Design",
    "Calls",
    "Build",
    "Fix Bugs",
    "Ship",
    "Review",
    "Plan",
];

const defaultPalette = [
    "#7dd3fc", // sky
    "#c084fc", // violet
    "#fda4af", // rose
    "#4ade80", // green
    "#facc15", // amber
    "#38bdf8", // light blue
    "#f472b6", // pink
    "#a3e635", // lime
];

function makeInitialBubbles(
    palette?: string[],
    labels?: string[],
    items?: BubbleItem[]
): Bubble[] {
    const resolvedItems =
        items !== undefined
            ? items.map((item, i) => ({
                  id: item.id,
                  label: item.label,
                  color: item.color,
                  r: item.radius ?? [46, 60, 40, 70, 52, 58, 48, 50][i % 8],
                  tag: item.tag,
                  glow: item.glow,
                  posX: item.posX,
                  posY: item.posY,
              }))
            : (labels && labels.length ? labels : defaultLabels).map(
                  (label, i) => {
                      const colors =
                          palette && palette.length ? palette : defaultPalette;
                      return {
                          id: String(i + 1),
                          label,
                          r: [46, 60, 40, 70, 52, 58, 48, 50][i % 8],
                          color: colors[i % colors.length],
                      };
                  }
              );

    const positions = [
        [100, 120],
        [220, 120],
        [120, 240],
        [260, 260],
        [110, 380],
        [240, 420],
        [180, 180],
        [300, 340],
    ];

    return resolvedItems.map((b, i) => {
        const [baseX, baseY] = positions[i % positions.length];
        const nx = clamp(b.posX ?? baseX / BASE_WIDTH, 0.05, 0.95);
        const ny = clamp(b.posY ?? baseY / BASE_HEIGHT, 0.05, 0.95);
        return {
            ...b,
            x: nx * BASE_WIDTH,
            y: ny * BASE_HEIGHT,
            nx,
            ny,
            vx: 0,
            vy: 0,
            z: i + 1,
        };
    });
}

/* =========================
   Component
========================= */

export default function BubbleBoard({
    palette,
    labels,
    items,
    surfaceClassName,
    onBubbleClick,
    onPositionChange,
}: {
    palette?: string[];
    labels?: string[];
    items?: BubbleItem[];
    surfaceClassName?: string;
    onBubbleClick?: (id: string) => void;
    onPositionChange?: (id: string, posX: number, posY: number) => void;
}) {
    const boardRef = useRef<HTMLDivElement | null>(null);
    const sizeRef = useRef({ w: 0, h: 0 });

    const [bubbles, setBubbles] = useState<Bubble[]>(() =>
        makeInitialBubbles(palette, labels, items)
    );
    const bubblesRef = useRef<Bubble[]>(bubbles);

    useEffect(() => {
        setBubbles(makeInitialBubbles(palette, labels, items));
    }, [palette, labels, items]);

    useEffect(() => {
        bubblesRef.current = bubbles;
    }, [bubbles]);

    const pointers = useRef<Map<number, PointerInfo>>(new Map());
    const activeBubble = useRef<string | null>(null);
    const dragInfo = useRef<{ id: string | null; moved: boolean }>({
        id: null,
        moved: false,
    });

    const pinchState = useRef<{
        baseDist: number;
        baseR: number;
    } | null>(null);

    /* =========================
       Measure board
    ========================= */

    useEffect(() => {
        const measure = () => {
            if (!boardRef.current) return;
            const rect = boardRef.current.getBoundingClientRect();
            sizeRef.current = { w: rect.width, h: rect.height };
            setBubbles((prev) =>
                prev.map((b) => ({
                    ...b,
                    x: clamp(b.nx * rect.width, b.r, rect.width - b.r),
                    y: clamp(b.ny * rect.height, b.r, rect.height - b.r),
                }))
            );
        };

        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, []);

    /* =========================
       Physics loop
    ========================= */

    useEffect(() => {
        let raf: number;

        const loop = () => {
            setBubbles((prev) => {
                const next = prev.map((b) => ({ ...b }));
                stepPhysics(next, sizeRef.current);
                return next;
            });
            raf = requestAnimationFrame(loop);
        };

        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, []);

    /* =========================
       Pointer helpers
    ========================= */

    const toLocal = (x: number, y: number) => {
        const rect = boardRef.current!.getBoundingClientRect();
        return { x: x - rect.left, y: y - rect.top };
    };

    const bringToFront = (id: string) => {
        setBubbles((prev) => {
            const maxZ = Math.max(...prev.map((b) => b.z));
            return prev.map((b) =>
                b.id === id ? { ...b, z: maxZ + 1 } : b
            );
        });
    };

    /* =========================
       Pointer events
    ========================= */

    const onPointerDown = (e: React.PointerEvent, id: string) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

        bringToFront(id);
        activeBubble.current = id;
        dragInfo.current = { id, moved: false };

        const p = toLocal(e.clientX, e.clientY);
        pointers.current.set(e.pointerId, {
            ...p,
            startX: p.x,
            startY: p.y,
        });

        pinchState.current = null;
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const id = activeBubble.current;
        if (!id) return;

        const pointer = pointers.current.get(e.pointerId);
        if (!pointer) return;

        const p = toLocal(e.clientX, e.clientY);
        pointer.x = p.x;
        pointer.y = p.y;

        const active = [...pointers.current.values()];

        /* --- Pinch resize --- */
        if (active.length >= 2) {
            const a = active[0];
            const b = active[1];
            const d = dist(a.x, a.y, b.x, b.y);

            if (!pinchState.current) {
                const bubble = bubbles.find((b) => b.id === id);
                pinchState.current = {
                    baseDist: d,
                    baseR: bubble?.r ?? 50,
                };
            }

            const scale = d / pinchState.current.baseDist;
            const newR = clamp(pinchState.current.baseR * scale, 28, 120);

            setBubbles((prev) =>
                prev.map((b) =>
                    b.id === id
                        ? { ...b, r: newR, vx: b.vx * 0.85, vy: b.vy * 0.85 }
                        : b
                )
            );
            return;
        }

        /* --- Drag --- */
        const dxRaw = p.x - pointer.startX;
        const dyRaw = p.y - pointer.startY;
        if (!dragInfo.current.moved && Math.hypot(dxRaw, dyRaw) > 4) {
            dragInfo.current.moved = true;
        }
        const dx = dxRaw * DRAG_SENSITIVITY;
        const dy = dyRaw * DRAG_SENSITIVITY;

        pointer.startX = p.x;
        pointer.startY = p.y;

        setBubbles((prev) =>
            prev.map((b) =>
                b.id === id
                    ? {
                        ...b,
                        x: b.x + dx,
                        y: b.y + dy,
                        vx: clamp(dx * DRAG_IMPULSE, -MAX_VELOCITY, MAX_VELOCITY),
                        vy: clamp(dy * DRAG_IMPULSE, -MAX_VELOCITY, MAX_VELOCITY),
                    }
                    : b
            )
        );
    };

    const onPointerUp = (e: React.PointerEvent) => {
        pointers.current.delete(e.pointerId);
        pinchState.current = null;

        if (pointers.current.size === 0) {
            activeBubble.current = null;
            if (dragInfo.current.id && dragInfo.current.moved) {
                const bubble = bubblesRef.current.find(
                    (b) => b.id === dragInfo.current.id
                );
                if (bubble && onPositionChange) {
                    onPositionChange(
                        bubble.id,
                        clamp(bubble.nx, 0.05, 0.95),
                        clamp(bubble.ny, 0.05, 0.95)
                    );
                }
            }
            dragInfo.current = { id: null, moved: false };
        }
    };

    /* =========================
       Render
    ========================= */

    const ordered = useMemo(
        () => [...bubbles].sort((a, b) => a.z - b.z),
        [bubbles]
    );

    return (
        <div className="flex h-full w-full flex-col">
            <div
                ref={boardRef}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className={`relative h-full min-h-[420px] w-full overflow-hidden rounded-none ring-0 touch-none ${surfaceClassName ?? "bg-gradient-to-b from-white/10 to-white/5"
                    }`}
            >
                {ordered.map((b) => (
                    <Bubble
                        key={b.id}
                        bubble={b}
                        onPointerDown={onPointerDown}
                        onClick={onBubbleClick}
                        suppressClick={
                            dragInfo.current.id === b.id &&
                            dragInfo.current.moved
                        }
                    />
                ))}
            </div>
        </div>
    );
}

/* =========================
   Bubble view
========================= */

function Bubble({
    bubble,
    onPointerDown,
    onClick,
    suppressClick,
}: {
    bubble: Bubble;
    onPointerDown: (e: React.PointerEvent, id: string) => void;
    onClick?: (id: string) => void;
    suppressClick?: boolean;
}) {
    const size = bubble.r * 2;

    return (
        <div
            onPointerDown={(e) => onPointerDown(e, bubble.id)}
            onClick={() => {
                if (suppressClick) return;
                onClick?.(bubble.id);
            }}
            className="absolute select-none"
            style={{
                width: size,
                height: size,
                left: bubble.x - bubble.r,
                top: bubble.y - bubble.r,
                zIndex: bubble.z,
                touchAction: "none",
            }}
        >
            <div
                className="
          relative h-full w-full rounded-full
          text-center
        "
                style={{
                    backgroundImage: `linear-gradient(180deg, #ffffff 0%, #ffffff 56%, ${bubble.color} 56%, ${bubble.color} 100%)`,
                    border: `1.5px solid ${bubble.color}`,
                    boxShadow: bubble.glow
                        ? `0 0 24px -8px ${bubble.glow}`
                        : "0 12px 28px -18px rgba(15,23,42,0.6)",
                }}
            >
                <div className="flex h-full w-full flex-col items-center pt-6 px-4">
                    <span className="text-sm font-medium text-zinc-600">
                        {bubble.label}
                    </span>
                    {bubble.tag ? (
                        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                            {bubble.tag}
                        </span>
                    ) : null}
                </div>
                <span className="absolute bottom-3 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-zinc-500 shadow">
                    o
                </span>
            </div>
        </div>
    );
}

/* =========================
   Physics step
========================= */

function stepPhysics(bubbles: Bubble[], size: { w: number; h: number }) {
    const { w, h } = size;
    if (!w || !h) return;

    // Move + friction
    for (const b of bubbles) {
        b.x += b.vx;
        b.y += b.vy;
        b.vx *= FRICTION;
        b.vy *= FRICTION;
    }

    // Walls
    for (const b of bubbles) {
        if (b.x < b.r) {
            b.x = b.r;
            b.vx *= -WALL_SPRING;
        } else if (b.x > w - b.r) {
            b.x = w - b.r;
            b.vx *= -WALL_SPRING;
        }

        if (b.y < b.r) {
            b.y = b.r;
            b.vy *= -WALL_SPRING;
        } else if (b.y > h - b.r) {
            b.y = h - b.r;
            b.vy *= -WALL_SPRING;
        }
    }

    // Collisions
    for (let i = 0; i < bubbles.length; i++) {
        for (let j = i + 1; j < bubbles.length; j++) {
            const a = bubbles[i];
            const b = bubbles[j];

            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d = Math.hypot(dx, dy);
            const min = a.r + b.r + 6;

            if (d > 0 && d < min) {
                const nx = dx / d;
                const ny = dy / d;
                const overlap = min - d;
                const push = overlap * COLLISION_PUSH;

                a.x += nx * push;
                a.y += ny * push;
                b.x -= nx * push;
                b.y -= ny * push;

                a.vx += nx * push * 0.12;
                a.vy += ny * push * 0.12;
                b.vx -= nx * push * 0.12;
                b.vy -= ny * push * 0.12;
            }
        }
    }

    for (const b of bubbles) {
        b.nx = clamp(b.x / w, 0.05, 0.95);
        b.ny = clamp(b.y / h, 0.05, 0.95);
    }
}
