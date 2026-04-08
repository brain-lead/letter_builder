import { NextRequest, NextResponse } from 'next/server'
import { APP_VERSION, APP_ID, APP_NAME, BUILD_DATE, RELEASE_TYPE, DEVELOPER, HWID_ENDPOINT, DEFAULT_USERNAME, LICENSE_PREFIX } from '@/lib/app-config'

export async function POST(req: NextRequest) {
  try {
    const { hwid, licenseKey, computerUsername } = await req.json()

    if (!hwid) return NextResponse.json({ error: 'HWID required' }, { status: 400 })

    // Build username — same format as Python version
    let username = DEFAULT_USERNAME
    if (licenseKey) {
      username = `${LICENSE_PREFIX}_${licenseKey}`
    }

    const payload = {
      username,
      hwid,
      computer_username: computerUsername || hwid, // Use HWID as fallback identifier
      app_version: APP_VERSION,
      build_date: BUILD_DATE,
      release_type: RELEASE_TYPE,
      developer: DEVELOPER,
      app_name: APP_NAME,
      app_id: APP_ID,
    }

    const response = await fetch(HWID_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const result = await response.json()

    if (response.status === 200) {
      return NextResponse.json({ authorized: true, message: result.message || 'Authorized' })
    } else {
      return NextResponse.json({
        authorized: false,
        message: result.message || 'Authorization failed',
        needsLicense: true,
      })
    }
  } catch (e: any) {
    return NextResponse.json({ authorized: false, message: `Auth failed: ${e.message}` }, { status: 500 })
  }
}
