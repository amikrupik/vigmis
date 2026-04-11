import { NextResponse } from 'next/server';
export function GET() {
  return new NextResponse('tiktok-developers-site-verification=xtpVXGlmrN2bQls9BPHWzyObIA2cdVzj', {
    headers: { 'Content-Type': 'text/plain' },
  });
}
