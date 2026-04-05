import { NextResponse } from 'next/server'

/**
 * Fyers v3 auth URL (confirmed from official docs + community):
 *   GET https://api-t1.fyers.in/api/v3/generate-authcode
 *     ?client_id=APPID-100          ← your App ID as-is from dashboard (already has -100)
 *     &redirect_uri=YOUR_URL
 *     &response_type=code
 *     &state=any_string
 *
 * NO nonce, NO hash needed here — hash is only needed for the token exchange step.
 * client_id = FYERS_APP_ID exactly as shown in myapi.fyers.in dashboard (e.g. "XY1234-100")
 * Do NOT append "-100" yourself — it's already part of the App ID.
 */
export async function GET() {
  const appId = process.env.FYERS_APP_ID // e.g. "XY1234-100" — full ID with suffix
  const redirectUrl = process.env.FYERS_REDIRECT_URL

  if (!appId || !redirectUrl) {
    return NextResponse.json(
      {
        error: 'Missing env vars. Set FYERS_APP_ID and FYERS_REDIRECT_URL in .env.local',
        tip: 'FYERS_APP_ID should be the full App ID from myapi.fyers.in e.g. "AB1234XY-100"',
      },
      { status: 500 }
    )
  }

  const authUrl = new URL('https://api-t1.fyers.in/api/v3/generate-authcode')
  authUrl.searchParams.set('client_id', appId)
  authUrl.searchParams.set('redirect_uri', redirectUrl)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('state', 'dashboard')

  console.log('[Fyers login] Redirecting to:', authUrl.toString())
  return NextResponse.redirect(authUrl.toString())
}
