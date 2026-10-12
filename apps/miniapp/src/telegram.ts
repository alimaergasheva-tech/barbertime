import { useEffect, useRef } from "react";

/** Subset of https://core.telegram.org/bots/webapps#initializing-mini-apps used by the app. */
type WebApp = {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; last_name?: string; username?: string } };
  version: string;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string | undefined>;
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  onEvent(event: "themeChanged", handler: () => void): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
  showConfirm?(message: string, callback: (confirmed: boolean) => void): void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

const webApp: WebApp | undefined = typeof window === "undefined" ? undefined : window.Telegram?.WebApp;

/** True only when opened by Telegram with signed launch data. */
export const isInTelegram = Boolean(webApp?.initData);

export const initData = webApp?.initData ?? "";

export const telegramUser = webApp?.initDataUnsafe.user;

/** Mirrors themeParams into --tg-theme-* CSS variables and the light/dark scheme. */
function applyTheme() {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.scheme = isInTelegram ? webApp!.colorScheme : prefersDark ? "dark" : "light";
  if (!isInTelegram) return;
  for (const [key, value] of Object.entries(webApp!.themeParams)) {
    if (value) root.style.setProperty(`--tg-theme-${key.replaceAll("_", "-")}`, value);
  }
}

export function initTelegram() {
  applyTheme();
  if (!webApp) return;
  webApp.ready();
  webApp.expand();
  webApp.onEvent("themeChanged", applyTheme);
}

export const haptic = {
  select: () => webApp?.HapticFeedback?.selectionChanged(),
  success: () => webApp?.HapticFeedback?.notificationOccurred("success"),
  error: () => webApp?.HapticFeedback?.notificationOccurred("error"),
};

export function confirmAction(message: string): Promise<boolean> {
  if (isInTelegram && webApp?.showConfirm && webApp.isVersionAtLeast("6.2")) {
    return new Promise((resolve) => webApp.showConfirm!(message, resolve));
  }
  return Promise.resolve(window.confirm(message));
}

/** Shows Telegram's native back button while `onBack` is set. */
export function useBackButton(onBack: (() => void) | null) {
  const handlerRef = useRef(onBack);
  useEffect(() => {
    handlerRef.current = onBack;
  });

  const visible = onBack !== null;
  useEffect(() => {
    if (!webApp || !visible) return;
    const handler = () => handlerRef.current?.();
    webApp.BackButton.onClick(handler);
    webApp.BackButton.show();
    return () => {
      webApp.BackButton.offClick(handler);
      webApp.BackButton.hide();
    };
  }, [visible]);
}
