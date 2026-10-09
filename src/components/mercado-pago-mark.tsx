import Image from "next/image";

type MercadoPagoMarkProps = {
  compact?: boolean;
};

export function MercadoPagoMark({ compact = false }: MercadoPagoMarkProps) {
  return (
    <span className={`mercado-pago-mark${compact ? " compact" : ""}`} aria-hidden="true">
      <Image
        src="/brands/mercado-pago/logo-horizontal-color.svg"
        alt=""
        width={1049}
        height={425}
        priority={false}
      />
    </span>
  );
}
