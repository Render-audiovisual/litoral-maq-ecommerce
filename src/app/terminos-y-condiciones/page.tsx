import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: "Condiciones de uso y compra de la tienda online de Litoral Maq.",
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <header>
        <span className="eyebrow orange">INFORMACIÓN LEGAL</span>
        <h1>Términos y condiciones</h1>
        <p>Última actualización: 28 de agosto de 2026.</p>
      </header>

      <section>
        <p>
          Estos términos regulan el uso del sitio de Litoral Maq y las compras realizadas
          mediante su tienda online. Al utilizar el sitio aceptás estas condiciones.
        </p>

        <h2>Productos, precios y disponibilidad</h2>
        <p>
          Las imágenes son ilustrativas. Los precios, promociones y existencias pueden
          actualizarse. Una compra queda sujeta a confirmación de disponibilidad y pago.
          Si un producto no estuviera disponible, Litoral Maq se comunicará para ofrecer
          una solución o gestionar la devolución correspondiente.
        </p>

        <h2>Pedidos y pagos</h2>
        <p>
          El cliente debe brindar datos correctos y mantener sus medios de contacto
          actualizados. Los pagos son procesados por los proveedores informados durante la
          compra; Litoral Maq no almacena los datos completos de tarjetas.
        </p>

        <h2>Entrega o retiro</h2>
        <p>
          Los costos, modalidades y plazos disponibles se informan durante el proceso de
          compra. Los plazos pueden variar por ubicación, disponibilidad y operador
          logístico. El cliente debe verificar que los datos de entrega sean correctos.
        </p>

        <h2>Cuentas</h2>
        <p>
          Podés comprar como invitado o crear una cuenta. Sos responsable de proteger tus
          credenciales. Litoral Maq puede restringir accesos ante fraude, abuso o uso que
          comprometa la seguridad del servicio.
        </p>

        <h2>Cambios, devoluciones y garantías</h2>
        <p>
          Se aplican las garantías del producto y los derechos reconocidos por la normativa
          argentina de defensa del consumidor. Para iniciar una gestión, comunicate por el
          WhatsApp comercial publicado en el sitio e indicá el número de pedido.
        </p>

        <h2>Uso del sitio</h2>
        <p>
          No está permitido intentar vulnerar el servicio, automatizar compras abusivas,
          suplantar identidades ni utilizar el contenido de forma ilícita. Podemos actualizar
          estos términos; la versión vigente siempre estará publicada en esta página.
        </p>

        <p>
          Consultá también nuestra <Link href="/politica-de-privacidad">Política de privacidad</Link>.
        </p>
      </section>
    </main>
  );
}
