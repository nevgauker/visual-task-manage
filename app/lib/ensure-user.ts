import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/app/lib/prisma";
import { ensureUserStats } from "@/app/lib/gamification";

export async function ensureUser(userId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const primaryEmail =
    user.emailAddresses.find(
      (email: { id: string; emailAddress: string }) =>
        email.id === user.primaryEmailAddressId
    )?.emailAddress ?? user.emailAddresses[0]?.emailAddress;

  if (!primaryEmail) {
    return;
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

  await prisma.user.upsert({
    where: { id: userId },
    update: {
      email: primaryEmail,
      name: name || primaryEmail,
      imageUrl: user.imageUrl ?? null,
    },
    create: {
      id: userId,
      email: primaryEmail,
      name: name || primaryEmail,
      imageUrl: user.imageUrl ?? null,
    },
  });

  await ensureUserStats(userId);
}
