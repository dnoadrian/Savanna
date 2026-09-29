// Web-App (PWA): Service Worker anmelden und „App installieren“ anbieten.
// Chrome/Edge/Android: echter Installations-Dialog; iPhone/iPad: Anleitung (Teilen → Home-Bildschirm).
let deferred = null;
const listeners = new Set();
const notify = () => { for (const fn of listeners) fn(); };

export function initPWA() {
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && secure) {
    const reg = () => navigator.serviceWorker.register('sw.js').catch(() => { /* z. B. privates Fenster */ });
    if (document.readyState === 'complete') reg();
    else window.addEventListener('load', reg, { once: true });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

// läuft schon als installierte App?
export function isInstalledApp() {
  try {
    return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || (matchMedia('(display-mode: fullscreen)').matches && !document.fullscreenElement && window.outerHeight - window.innerHeight < 4);
  } catch {
    return false;
  }
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// true: der Browser zeigt seinen eigenen Installations-Dialog
export function hasInstallPrompt() {
  return !!deferred;
}

// 'accepted' | 'dismissed' | 'ios' | 'manual'
export async function installApp() {
  if (deferred) {
    const ev = deferred;
    deferred = null;
    ev.prompt();
    let outcome = 'dismissed';
    try { outcome = (await ev.userChoice).outcome; } catch { /* ignorieren */ }
    notify();
    return outcome;
  }
  return isIOS() ? 'ios' : 'manual';
}

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
