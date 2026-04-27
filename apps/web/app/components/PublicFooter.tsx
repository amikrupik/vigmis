import Image from 'next/image';
import Link from 'next/link';

export default function PublicFooter() {
  return (
    <footer className="border-t border-slate-100 px-6 py-8">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <Link href="/">
          <Image src="/logo_nav.png" alt="Vigmis" width={160} height={36} />
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
          <Link href="/about" className="hover:text-slate-600">About</Link>
          <Link href="/faq" className="hover:text-slate-600">FAQ</Link>
          <Link href="/contact" className="hover:text-slate-600">Contact</Link>
          <Link href="/privacy" className="hover:text-slate-600">Privacy</Link>
          <Link href="/terms" className="hover:text-slate-600">Terms</Link>
          <Link href="/refund" className="hover:text-slate-600">Refund</Link>
          <Link href="/cookies" className="hover:text-slate-600">Cookies</Link>
          <Link href="/acceptable-use" className="hover:text-slate-600">Acceptable Use</Link>
        </div>
        <p className="text-xs text-slate-400 text-center">© {new Date().getFullYear()} Taurus Management and Investments Ltd.</p>
      </div>
    </footer>
  );
}
