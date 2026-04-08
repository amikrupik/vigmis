import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { ClerkSignOutButton } from "../components/sign-out-button";

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user?.id) {
    redirect("/sign-in");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-3xl rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold text-zinc-950">Profile</h1>
            <p className="mt-2 text-base text-zinc-600">User details from Clerk.</p>
          </div>
          <ClerkSignOutButton />
        </div>

        <div className="mt-8 grid gap-4 text-sm text-zinc-700">
          <div>
            <span className="block text-xs uppercase tracking-[0.2em] text-zinc-500">User ID</span>
            <p className="mt-1 break-all font-medium text-zinc-900">{user.id}</p>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-[0.2em] text-zinc-500">Email</span>
            <p className="mt-1 font-medium text-zinc-900">{user.primaryEmailAddress?.emailAddress ?? "Unknown"}</p>
          </div>
          <div>
            <span className="block text-xs uppercase tracking-[0.2em] text-zinc-500">Name</span>
            <p className="mt-1 font-medium text-zinc-900">{`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "No name provided"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
