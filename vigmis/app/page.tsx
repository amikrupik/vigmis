import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { ClerkSignOutButton } from "./components/sign-out-button";

export default async function Home() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="flex w-full items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Welcome back!
            </h1>
            <p className="mt-2 text-base text-zinc-600 dark:text-zinc-400">
              You are signed in as <span className="font-medium">{userId}</span>.
            </p>
          </div>
          <ClerkSignOutButton />
        </div>

        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />

        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            This page is protected by Clerk authentication. Only logged-in users can access it.
          </p>
          <a
            href="/profile"
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Open profile
          </a>
        </div>
      </main>
    </div>
  );
}
