/**
 * Bridge to the iOS Screen Time / Family Controls layer.
 *
 * A web page can never restrict other apps — that requires a native iOS build
 * (Capacitor shell + Apple's Family Controls entitlement) exposing a plugin on
 * `window.LockedInScreenTime`. When the app runs in a plain browser the bridge
 * reports "unsupported" and Lock Mode degrades to the on-screen focus lock.
 */

export type ShieldStatus =
  | "unsupported" // plain browser / PWA — no native bridge present
  | "unauthorized" // native shell present, user hasn't granted Screen Time
  | "ready" // authorized, not currently shielding
  | "shielding"; // other apps are blocked right now

type NativeBridge = {
  isAvailable?: () => Promise<boolean> | boolean;
  requestAuthorization?: () => Promise<boolean> | boolean;
  startShielding?: (opts: { taskTitle: string; seconds: number }) => Promise<void> | void;
  stopShielding?: () => Promise<void> | void;
};

function bridge(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { LockedInScreenTime?: NativeBridge }).LockedInScreenTime ?? null;
}

export async function detectScreenTime(): Promise<ShieldStatus> {
  const b = bridge();
  if (!b?.isAvailable) return "unsupported";
  try {
    return (await b.isAvailable()) ? "ready" : "unauthorized";
  } catch {
    return "unsupported";
  }
}

export async function requestScreenTime(): Promise<ShieldStatus> {
  const b = bridge();
  if (!b?.requestAuthorization) return "unsupported";
  try {
    return (await b.requestAuthorization()) ? "ready" : "unauthorized";
  } catch {
    return "unauthorized";
  }
}

export async function startShielding(taskTitle: string, seconds: number): Promise<boolean> {
  const b = bridge();
  if (!b?.startShielding) return false;
  try {
    await b.startShielding({ taskTitle, seconds });
    return true;
  } catch {
    return false;
  }
}

export async function stopShielding(): Promise<void> {
  const b = bridge();
  try {
    await b?.stopShielding?.();
  } catch {
    /* ignore */
  }
}
