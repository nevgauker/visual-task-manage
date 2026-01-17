import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="min-h-dvh bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg items-center justify-center px-6">
        <SignIn />
      </div>
    </main>
  );
}
