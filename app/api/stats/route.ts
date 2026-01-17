import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/app/lib/ensure-user";
import { getUserStatsSnapshot } from "@/app/lib/gamification";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await ensureUser(userId);

  const snapshot = await getUserStatsSnapshot(userId);
  return NextResponse.json(snapshot);
}
