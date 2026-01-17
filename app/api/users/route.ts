import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/app/lib/prisma";
import { ensureUser } from "@/app/lib/ensure-user";

type UserSummary = {
  id: string;
  email: string;
  name: string;
};

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await ensureUser(userId);

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim() || "";

  if (!query) {
    return NextResponse.json([]);
  }

  const users = await prisma.user.findMany({
    where: {
      AND: [
        { id: { not: userId } },
        {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        },
      ],
    },
    take: 50,
    orderBy: { email: "asc" },
  });

  const summaries: UserSummary[] = users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name || user.email,
  }));

  return NextResponse.json(summaries);
}
