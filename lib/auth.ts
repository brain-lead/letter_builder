import { ENCRYPTION_KEY, DEFAULT_USERNAME, LICENSE_PREFIX } from './app-config'

// XOR encrypt (matches Python version)
export function encryptText(text: string, key: string = ENCRYPTION_KEY): string {
  let result = ''
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return btoa(result)
}

// XOR decrypt (matches Python version)
export function decryptText(encrypted: string, key: string = ENCRYPTION_KEY): string | null {
  try {
    const decoded = atob(encrypted)
    let result = ''
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length))
    }
    return result
  } catch {
    return null
  }
}

// Browser fingerprint as HWID
export async function getHWID(): Promise<string> {
  try {
    const FingerprintJS = (await import('@fingerprintjs/fingerprintjs' as any)).default
    const fp = await FingerprintJS.load()
    const result = await fp.get()
    return result.visitorId
  } catch {
    // Fallback: generate from navigator properties
    const nav = window.navigator
    const raw = [
      nav.userAgent, nav.language, nav.hardwareConcurrency,
      screen.width, screen.height, screen.colorDepth,
      new Date().getTimezoneOffset(),
    ].join('|')
    let hash = 0
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i)
      hash |= 0
    }
    return Math.abs(hash).toString(16)
  }
}

// Save license to localStorage (encrypted)
export function saveLicense(licenseKey: string, username: string): void {
  const data = {
    license_key: encryptText(licenseKey),
    username: encryptText(username),
  }
  localStorage.setItem('lb_license', JSON.stringify(data))
}

// Load license from localStorage (decrypted)
export function loadLicense(): { licenseKey: string; username: string } | null {
  try {
    const raw = localStorage.getItem('lb_license')
    if (!raw) return null
    const data = JSON.parse(raw)
    const licenseKey = decryptText(data.license_key)
    const username = decryptText(data.username)
    if (licenseKey && username) return { licenseKey, username }
  } catch {}
  return null
}

// Clear license
export function clearLicense(): void {
  localStorage.removeItem('lb_license')
}

// Get username (from saved license or default)
export function getUsername(): string {
  const saved = loadLicense()
  if (saved) return saved.username
  return DEFAULT_USERNAME
}

// Check if user is on trial
export function isTrialUser(): boolean {
  const username = getUsername()
  const saved = loadLicense()
  return (
    username.toLowerCase().includes('trial') ||
    (saved?.username || '').toLowerCase().includes('trial') ||
    (saved?.licenseKey || '').toLowerCase().includes('trial') ||
    DEFAULT_USERNAME.toLowerCase().includes('trial')
  )
}
