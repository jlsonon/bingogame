import { useEffect, useState } from 'react';

export interface LanInfo {
  ip: string;
  port: number;
  lanUrl: string;
  allIps: { interface: string; address: string }[];
}

let cachedLanInfo: LanInfo | null = null;
let inflightLanPromise: Promise<LanInfo | null> | null = null;

export async function fetchLanInfo(): Promise<LanInfo | null> {
  if (cachedLanInfo) return cachedLanInfo;
  if (!inflightLanPromise) {
    inflightLanPromise = fetch('/api/lan-info')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LanInfo | null) => {
        if (data && data.lanUrl) {
          cachedLanInfo = data;
        }
        return cachedLanInfo;
      })
      .catch(() => null);
  }
  return inflightLanPromise;
}

export function isLocalhostOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function useLanJoinBase() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const [lanInfo, setLanInfo] = useState<LanInfo | null>(cachedLanInfo);

  useEffect(() => {
    let mounted = true;
    fetchLanInfo().then((info) => {
      if (mounted && info) setLanInfo(info);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // When running on the Host MacBook (localhost / macOS app), expose the Wi-Fi LAN URL for phones to join.
  // When running on a public HTTPS domain or already via LAN IP, keep the current origin.
  const useLan = isLocalhostOrigin() && Boolean(lanInfo && lanInfo.ip !== '127.0.0.1');
  const baseUrl = useLan && lanInfo ? lanInfo.lanUrl : origin;
  const displayHost = baseUrl.replace(/^https?:\/\//, '');

  return {
    baseUrl,
    displayHost,
    lanIp: lanInfo?.ip || null,
    isLanAddress: useLan || /^\d{1,3}(\.\d{1,3}){3}$/.test(typeof window !== 'undefined' ? window.location.hostname : ''),
  };
}

export async function copyTextSafe(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to legacy textarea copy for HTTP LAN origins
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
