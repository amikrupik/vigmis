import { NextResponse } from 'next/server';
export function GET() {
  return new NextResponse('tiktok-developers-site-verification=2SCYjNOs8dReqWEv7qIxbxwyLAy1RiVu', {
    headers: { 'Content-Type': 'text/plain' },
  });
}
