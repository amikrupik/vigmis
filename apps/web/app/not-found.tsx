import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6 p-6">
      <Image src="/logo.png" alt="Vigmis" width={100} height={36} priority />
      <div className="text-center space-y-2">
        <p className="text-6xl font-black text-slate-200">404</p>
        <h1 className="text-xl font-bold text-slate-900">Page not found</h1>
        <p className="text-slate-500 text-sm">The page you're looking for doesn't exist.</p>
      </div>
      <Link href="/dashboard" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">
        Back to Dashboard →
      </Link>
    </div>
  );
}
