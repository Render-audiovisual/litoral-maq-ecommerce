import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Cómo Litoral Maq trata los datos de sus clientes y visitantes.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <header>
        <span className="eyebrow orange">INFORMACIÓN LEGAL</span>
        <h1>Política de privacidad</h1>
        <p>Última actualización: 28 de agosto de 2026.</p>
      </header>

      <section>
        <p>
          Litoral Maq utiliza los datos personales únicamente para operar esta tienda,
          gestionar cuentas, procesar pedidos, brindar seguimiento y responder consultas.
        </p>

        <h2>Datos que podemos tratar</h2>
        <ul>
          <li>Nombre, email, teléfono y datos necesarios para la entrega o retiro.</li>
          <li>Información de cuenta e historial de pedidos.</li>
          <li>
            Si ingresás con Google: nombre, dirección de email, foto de perfil e
            identificador de la cuenta. No accedemos a Gmail, Drive ni a tus contactos.
          </li>
          <li>Datos técnicos básicos necesarios para seguridad, sesión y funcionamiento.</li>
        </ul>

        <h2>Para qué usamos los datos</h2>
        <p>
          Los usamos para autenticarte, conservar tu carrito y tus pedidos, coordinar pagos
          y entregas, prevenir abusos y brindar soporte. No vendemos datos personales.
        </p>

        <h2>Proveedores</h2>
        <p>
          Para prestar el servicio podemos utilizar proveedores de autenticación,
          infraestructura, correo, pagos y logística, como Supabase, Google, Resend y
          Mercado Pago. Cada proveedor trata la información necesaria según sus propias
          condiciones y medidas de seguridad.
        </p>

        <h2>Conservación y seguridad</h2>
        <p>
          Conservamos los datos durante el tiempo necesario para gestionar la relación
          comercial, cumplir obligaciones aplicables y resolver reclamos. Aplicamos medidas
          técnicas y controles de acceso para proteger la información.
        </p>

        <h2>Tus opciones</h2>
        <p>
          Podés solicitar acceso, corrección o eliminación de tus datos mediante el WhatsApp
          comercial publicado en este sitio. Algunos datos de pedidos pueden conservarse
          cuando exista una obligación legal o contable.
        </p>

        <p>
          <Link href="/">Volver al inicio</Link>
        </p>
      </section>
    </main>
  );
}
