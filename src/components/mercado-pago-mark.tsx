type MercadoPagoMarkProps = {
  compact?: boolean;
};

export function MercadoPagoMark({ compact = false }: MercadoPagoMarkProps) {
  return (
    <span className={`mercado-pago-mark${compact ? " compact" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 44 30" focusable="false">
        <ellipse cx="22" cy="15" rx="20" ry="13" />
        <path d="M7.5 14.5c3.1-3.8 6.5-4.9 10.2-2.2l2.4 1.7c1.2.9 2.8.8 3.9-.2l2.2-2c2.6-2.3 6.8-.7 10.3 2.8" />
        <path d="m10.2 16.2 5.1 4.1c1.1.9 2.7.7 3.5-.4l.5-.7m-5.5-5.8 7 5.5c1.1.9 2.8.7 3.7-.5l.3-.5m-6.6-5.7 7.6 5.3c1.2.8 2.9.5 3.7-.7m-9.4-2.8 3.1-2.8" />
      </svg>
      {!compact && (
        <span className="mercado-pago-wordmark">
          <b>mercado</b>
          <b>pago</b>
        </span>
      )}
    </span>
  );
}
