"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/store/store";
import { isPermanentCustomerSession } from "@/lib/auth";
import { isWelcomePromotionEnabled } from "@/lib/welcome-promotion";
import { isMercadoPagoEnabled } from "@/services/payments";
import { welcomePopupDelay } from "@/lib/welcome-popup-timing";
import "./welcome-discount-preview.css";

// Design preview only. Do not mount in the public store before the server
// enforces eligibility and the first-paid-purchase discount.
export function WelcomeDiscountPreview({forcePreview=false}:{forcePreview?:boolean}) {
  const pathname=usePathname();
  const {customerSession,ready}=useStore();
  const allowed=forcePreview || (isWelcomePromotionEnabled() && isMercadoPagoEnabled() && ready && !isPermanentCustomerSession(customerSession) && ["/","/productos","/producto","/mas-vendidos"].includes(pathname.replace(/\/$/,"") || "/"));
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if(!allowed) return;
    const modal = dialog.current;
    if(!forcePreview) {
      try { const seen=Number(localStorage.getItem("litoral-welcome-seen-v1")); if(Number.isFinite(seen) && Date.now()-seen < 7*24*60*60*1000) return; } catch { /* Storage is optional. */ }
    }
    const timeout=setTimeout(()=>{
      modal?.showModal(); title.current?.focus();
      if(!forcePreview) {try {localStorage.setItem("litoral-welcome-seen-v1",String(Date.now()));} catch { /* Private browsing. */ }}
    },forcePreview ? 0 : welcomePopupDelay(performance.now()));
    return () => { clearTimeout(timeout); modal?.close(); };
  }, [allowed,forcePreview]);
  function close() { dialog.current?.close(); if(forcePreview) opener.current?.focus(); }
  if(!allowed) return null;
  return <>
    {forcePreview && <button ref={opener} className="welcome-preview-reopen" onClick={() => dialog.current?.showModal()}>Ver aviso del 5%</button>}
    <dialog ref={dialog} className="welcome-discount" aria-labelledby="welcome-discount-title" aria-describedby="welcome-discount-description" onCancel={close}>
      <button className="welcome-close" aria-label="Cerrar aviso" onClick={close}>×</button>
      <div className="welcome-logo"><Image src="/brand/AZUL.png" alt="Litoral Maq" width={180} height={180} /></div>
      <p className="welcome-eyebrow">Tu primera compra, con beneficio</p>
      <div className="welcome-percent" aria-hidden="true">5<span>%</span><small>OFF</small></div>
      <h2 ref={title} tabIndex={-1} id="welcome-discount-title">Registrate y obtené<br />5% de descuento</h2>
      <p id="welcome-discount-description">Creá tu cuenta y ahorrá en tu primera compra.</p>
      <Link href="/registro" className="welcome-register">Registrarme y obtener el 5% <span aria-hidden="true">→</span></Link>
      <button className="welcome-continue" onClick={close}>Seguir mirando</button>
      <p className="welcome-terms">Una vez por cuenta, en tu primera compra pagada.<br />Sobre productos. No incluye el envío.</p>
    </dialog>
  </>;
}
