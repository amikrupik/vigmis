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
    <div className="min-h-screen bg-zinc-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Image
            src="/logo.png"
            alt="Vigmis"
            width={140}
            height={50}
            priority
          />
          <ClerkSignOutButton />
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-semibold text-zinc-900 mb-2">
          Welcome back
        </h1>
        <p className="text-zinc-500 mb-10">
          Your marketing OS is ready.
        </p>

        {/* Nav cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <a href="/onboarding" className="group rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-teal-400 transition-all">
            <div className="text-2xl mb-3">🚀</div>
            <h2 className="text-lg font-semibold text-zinc-900 group-hover:text-teal-600">Onboarding</h2>
            <p className="mt-1 text-sm text-zinc-500">Set up your business profile and connect ad accounts.</p>
          </a>

          <a href="/dashboard" className="group rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-teal-400 transition-all">
            <div className="text-2xl mb-3">📊</div>
            <h2 className="text-lg font-semibold text-zinc-900 group-hover:text-teal-600">Dashboard</h2>
            <p className="mt-1 text-sm text-zinc-500">View campaign performance, spend, and ROAS.</p>
          </a>

          <a href="/billing" className="group rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-teal-400 transition-all">
            <div className="text-2xl mb-3">💳</div>
            <h2 className="text-lg font-semibold text-zinc-900 group-hover:text-teal-600">Billing</h2>
            <p className="mt-1 text-sm text-zinc-500">Manage your subscription and payment history.</p>
          </a>

          <a href="/profile" className="group rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-teal-400 transition-all">
            <div className="text-2xl mb-3">👤</div>
            <h2 className="text-lg font-semibold text-zinc-900 group-hover:text-teal-600">Profile</h2>
            <p className="mt-1 text-sm text-zinc-500">Update your account settings and preferences.</p>
          </a>
        </div>
      </main>
    </div>
  );
}
