import { NextResponse } from 'next/server';
export function GET() {
  return new NextResponse('tiktok-developers-site-verification=Ju5VbEdtJ2xOwu1FNRk8Zq8WBIHAqmmH', {
    headers: { 'Content-Type': 'text/plain' },
  });
}
