import { NextResponse } from 'next/server';
export function GET() {
  return new NextResponse('tiktok-developers-site-verification=FKdY6CjQCCckeNNfGdHVhCnsLNqaeO3u', {
    headers: { 'Content-Type': 'text/plain' },
  });
}
