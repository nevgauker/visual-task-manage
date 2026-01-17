import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/app/lib/prisma";
import { ensureUser } from "@/app/lib/ensure-user";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await ensureUser(userId);

  const categories = await prisma.category.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(categories);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await ensureUser(userId);

  const body = (await request.json()) as {
    name?: string;
    color?: string;
  };

  const name = body.name?.trim();
  const color = body.color?.trim();

  if (!name) {
    return NextResponse.json(
      { error: "Name is required." },
      { status: 400 }
    );
  }

  if (!color) {
    return NextResponse.json(
      { error: "Color is required." },
      { status: 400 }
    );
  }

  try {
    const category = await prisma.category.create({
      data: {
        ownerId: userId,
        name,
        color,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create category." },
      { status: 500 }
    );
  }
}
