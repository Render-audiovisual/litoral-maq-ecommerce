"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

type LightboxImage = { src: string; alt: string };

type ImageLightboxProps = {
  images: LightboxImage[];
  index: number;
  open: boolean;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

const ZOOM = 2.5;
const SWIPE_PX = 50;

const icon = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const clamp = (value: number) => Math.min(100, Math.max(0, value));

/** Visor a pantalla completa sobre <dialog> nativo: foco atrapado, Esc y página inerte vienen gratis. */
export function ImageLightbox({ images, index, open, onIndexChange, onClose }: ImageLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const gesture = useRef({ x: 0, y: 0, lastX: 0, lastY: 0, moved: false, active: false });
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const count = images.length;
  const current = images[Math.min(index, count - 1)];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open || count < 2) return;
    for (const offset of [1, -1]) {
      new window.Image().src = images[(index + offset + count) % count].src;
    }
  }, [open, index, count, images]);

  const go = (step: number) => {
    setZoomed(false);
    onIndexChange((index + step + count) % count);
  };

  const toggleZoom = () => {
    setOrigin({ x: 50, y: 50 });
    setZoomed((value) => !value);
  };

  const pointerPercent = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100),
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      active: true,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (Math.hypot(event.clientX - g.x, event.clientY - g.y) > 10 && g.active) g.moved = true;
    if (!zoomed) return;
    if (event.pointerType === "mouse") {
      setOrigin(pointerPercent(event));
      return;
    }
    if (!g.active) return;
    // En táctil se arrastra la foto: el origen se mueve al revés del dedo.
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = ((event.clientX - g.lastX) / rect.width) * 100;
    const dy = ((event.clientY - g.lastY) / rect.height) * 100;
    g.lastX = event.clientX;
    g.lastY = event.clientY;
    setOrigin((o) => ({ x: clamp(o.x - dx), y: clamp(o.y - dy) }));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    g.active = false;
    if (zoomed || event.pointerType === "mouse" || count < 2) return;
    const dx = event.clientX - g.x;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(event.clientY - g.y)) go(dx < 0 ? 1 : -1);
  };

  const onSheetClick = (event: MouseEvent<HTMLDivElement>) => {
    if (gesture.current.moved) return;
    if (zoomed) {
      setZoomed(false);
      return;
    }
    setOrigin(pointerPercent(event));
    setZoomed(true);
  };

  if (!current) return null;

  return (
    <dialog
      ref={dialogRef}
      className="lightbox"
      aria-label="Vista ampliada del producto"
      onClose={() => {
        setZoomed(false);
        onClose();
        returnFocusRef.current?.focus();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (count < 2) return;
        if (event.key === "ArrowRight") go(1);
        if (event.key === "ArrowLeft") go(-1);
      }}
    >
      <p className="lightbox-counter" aria-live="polite" hidden={count < 2}>
        {index + 1} / {count}
      </p>
      <div className="lightbox-tools">
        <button
          type="button"
          className="lightbox-button"
          aria-label={zoomed ? "Alejar" : "Acercar"}
          aria-pressed={zoomed}
          onClick={toggleZoom}
        >
          <svg {...icon}>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.4-4.4" />
            <path d="M8.5 11h5" />
            {!zoomed && <path d="M11 8.5v5" />}
          </svg>
        </button>
        <button
          ref={closeRef}
          type="button"
          className="lightbox-button"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <svg {...icon}>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div
        className={`lightbox-sheet${zoomed ? " zoomed" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (gesture.current.active = false)}
        onClick={onSheetClick}
      >
        <Image
          key={current.src}
          src={current.src}
          alt={current.alt}
          fill
          sizes="92vw"
          draggable={false}
          style={{
            transform: zoomed ? `scale(${ZOOM})` : undefined,
            transformOrigin: `${origin.x}% ${origin.y}%`,
          }}
        />
      </div>
      {count > 1 && (
        <>
          <button
            type="button"
            className="lightbox-button lightbox-arrow prev"
            aria-label="Imagen anterior"
            onClick={() => go(-1)}
          >
            <svg {...icon}>
              <path d="m15 5-7 7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            className="lightbox-button lightbox-arrow next"
            aria-label="Imagen siguiente"
            onClick={() => go(1)}
          >
            <svg {...icon}>
              <path d="m9 5 7 7-7 7" />
            </svg>
          </button>
        </>
      )}
    </dialog>
  );
}
