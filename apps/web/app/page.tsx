import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

export default async function Home() {
  const { userId, getToken } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  try {
    const token = await getToken();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

    const res = await fetch(`${apiUrl}/onboarding/status`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      if (data.completed) {
        redirect("/dashboard");
      } else {
        redirect("/onboarding");
      }
    } else {
      redirect("/onboarding");
    }
  } catch {
    redirect("/onboarding");
  }
}
