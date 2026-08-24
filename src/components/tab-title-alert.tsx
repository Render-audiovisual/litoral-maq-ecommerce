"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useStore } from "@/store/store";

const LEAVING = "🚨 ¡No te vayas!";
const CHECKOUT = "🛒 Enviá tu solicitud";

export function TabTitleAlert() {
  const pathname = usePathname();
  const { cartCount, orders } = useStore();
  const enabled = !pathname.startsWith("/admin");
  const hasCart = cartCount > 0;
  const pendingOrderCount = orders.filter((order) => order.status === "pendiente").length;

  useEffect(() => {
    if (!pathname.startsWith("/admin") || pathname === "/admin/login") return;

    const title = pendingOrderCount > 0
      ? `(${pendingOrderCount}) Pedidos pendientes · Litoral Maq`
      : "Panel Litoral Maq";
    const applyTitle = () => {
      if (document.title !== title) document.title = title;
    };

    applyTitle();
    const observer = new MutationObserver(applyTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  }, [pathname, pendingOrderCount]);

  useEffect(() => {
    if (!enabled) return;

    const messages = hasCart ? [LEAVING, CHECKOUT] : [LEAVING];
    let original = document.title;
    let timer: ReturnType<typeof setInterval> | undefined;

    const onVisibilityChange = () => {
      clearInterval(timer);
      if (document.hidden) {
        original = document.title;
        let i = 0;
        document.title = messages[0];
        if (messages.length > 1) {
          timer = setInterval(() => {
            i = (i + 1) % messages.length;
            document.title = messages[i];
          }, 1500);
        }
      } else {
        document.title = original;
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.title = original;
    };
  }, [enabled, hasCart]);

  return null;
}
