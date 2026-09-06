"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Notification = { id: number; type: "success" | "error"; message: string };
type Notify = (type: Notification["type"], message: string) => void;
const NotificationContext = createContext<Notify | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notification, setNotification] = useState<Notification | null>(null);
  const notify = useCallback<Notify>((type, message) => setNotification({ id: Date.now(), type, message }), []);
  const value = useMemo(() => notify, [notify]);
  useEffect(() => { const flash = window.sessionStorage.getItem("equilibra-notification"); if (!flash) return; window.sessionStorage.removeItem("equilibra-notification"); try { const parsed = JSON.parse(flash) as Pick<Notification, "type" | "message">; window.queueMicrotask(() => notify(parsed.type, parsed.message)); } catch { /* valor inválido é descartado */ } }, [notify]);
  return <NotificationContext.Provider value={value}>{children}{notification && <NotificationToast notification={notification} close={() => setNotification(null)} />}</NotificationContext.Provider>;
}

function NotificationToast({ notification, close }: { notification: Notification; close: () => void }) {
  useEffect(() => { const timer = window.setTimeout(close, notification.type === "error" ? 6500 : 4000); return () => window.clearTimeout(timer); }, [notification, close]);
  return <aside className={`notification-toast notification-${notification.type}`} role={notification.type === "error" ? "alert" : "status"} aria-live={notification.type === "error" ? "assertive" : "polite"}><span className="notification-icon" aria-hidden="true">{notification.type === "success" ? "✓" : "!"}</span><div><strong>{notification.type === "success" ? "Tudo certo" : "Algo deu errado"}</strong><p>{notification.message}</p></div><button onClick={close} aria-label="Fechar notificação">×</button></aside>;
}

export function useNotifications() {
  const notify = useContext(NotificationContext);
  if (!notify) throw new Error("useNotifications deve ser usado dentro de NotificationProvider.");
  return notify;
}

export function setNextPageNotification(type: Notification["type"], message: string) {
  window.sessionStorage.setItem("equilibra-notification", JSON.stringify({ type, message }));
}
