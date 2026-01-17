import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="min-h-dvh bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg items-center justify-center px-6">
        <SignUp />
      </div>
    </main>
  );
}
