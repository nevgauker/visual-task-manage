import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

type ClerkWebhookEvent = {
  type: string;
  data: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    image_url: string | null;
    email_addresses: { id: string; email_address: string }[];
    primary_email_address_id: string | null;
  };
};

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Missing Clerk webhook secret." },
      { status: 500 }
    );
  }

  const payload = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing Svix headers." },
      { status: 400 }
    );
  }

  let event: ClerkWebhookEvent;
  try {
    const webhook = new Webhook(secret);
    event = webhook.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "user.created") {
    const {
      id,
      first_name,
      last_name,
      image_url,
      email_addresses,
      primary_email_address_id,
    } =
      event.data;

    const primaryEmail =
      email_addresses.find((email) => email.id === primary_email_address_id)
        ?.email_address ?? email_addresses[0]?.email_address;

    if (!primaryEmail) {
      return NextResponse.json(
        { error: "User email not found." },
        { status: 400 }
      );
    }

    const name = [first_name, last_name].filter(Boolean).join(" ").trim();
    await prisma.user.upsert({
      where: { id },
      update: {
        email: primaryEmail,
        name: name || primaryEmail,
        imageUrl: image_url ?? null,
      },
      create: {
        id,
        email: primaryEmail,
        name: name || primaryEmail,
        imageUrl: image_url ?? null,
      },
    });
  }

  return NextResponse.json({ received: true });
}
