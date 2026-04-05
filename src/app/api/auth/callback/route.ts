import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { setToken, midnightIST } from '@/lib/tokenStore'

/**
 * Fyers redirects here after login:
 *   GET /api/auth/callback?auth_code=XXX&state=dashboard
 *
 * Token exchange (confirmed from official docs):
 *   POST https://api-t1.fyers.in/api/v3/validate-authcode
 *   Body: { grant_type, appIdHash, code }
 *
 *   appIdHash = SHA-256 of "APP_ID-100:SECRET_KEY"
 *   APP_ID-100 = FYERS_APP_ID (already includes -100, do not append again)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const authCode = searchParams.get('auth_code') || searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !authCode) {
    console.error(
      '[Fyers callback] Error or no auth_code:',
      error,
      Array.from(searchParams.entries())
    )
    return NextResponse.redirect(
      new URL('http://localhost:3000/?auth=failed&msg=' + encodeURIComponent(error || 'no_code'))
    )
  }

  const appId = process.env.FYERS_APP_ID! // e.g. "AB1234XY-100"
  const secretKey = process.env.FYERS_SECRET_KEY!

  // SHA-256 of "APPID-100:secretKey" — appId already has -100
  const appIdHash = crypto.createHash('sha256').update(`${appId}:${secretKey}`).digest('hex')

  console.log('[Fyers callback] Exchanging auth_code for access_token…')
  console.log('[Fyers callback] appId:', appId)

  try {
    const res = await fetch('https://api-t1.fyers.in/api/v3/validate-authcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        appIdHash,
        code: authCode,
      }),
    })

    const json = await res.json()
    console.log('[Fyers callback] Response:', JSON.stringify(json).slice(0, 300))

    if (json.s !== 'ok' || !json.access_token) {
      return NextResponse.redirect(
        new URL(
          `http://localhost:3000/?auth=failed&msg=${encodeURIComponent(json.message || JSON.stringify(json))}`
        )
      )
    }

    setToken({
      accessToken: json.access_token,
      clientId: appId,
      expiresAt: midnightIST(),
    })

    return NextResponse.redirect(new URL('http://localhost:3000/?auth=ok'))
  } catch (e: any) {
    console.error('[Fyers callback error]', e.message)
    return NextResponse.redirect(
      new URL(`http://localhost:3000/?auth=failed&msg=${encodeURIComponent(e.message)}`)
    )
  }
}
