import { NextResponse } from 'next/server'
import { getToken, isTokenValid } from '@/lib/tokenStore'

export async function GET() {
  const valid = isTokenValid()
  const token = getToken()
  return NextResponse.json({
    authenticated: valid,
    clientId: token?.clientId || null,
    expiresAt: token?.expiresAt || null,
  })
}
