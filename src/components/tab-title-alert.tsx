"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const MESSAGES = ["🚨 ¡No te vayas!", "🛒 Finalizá tu compra"];

export function TabTitleAlert() {
  const pathname = usePathname();
  const enabled = !pathname.startsWith("/admin");

  useEffect(() => {
    if (!enabled) return;

    let original = document.title;
    let timer: ReturnType<typeof setInterval> | undefined;

    const onVisibilityChange = () => {
      clearInterval(timer);
      if (document.hidden) {
        original = document.title;
        let i = 0;
        document.title = MESSAGES[0];
        timer = setInterval(() => {
          i = (i + 1) % MESSAGES.length;
          document.title = MESSAGES[i];
        }, 1500);
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
  }, [enabled]);

  return null;
}
