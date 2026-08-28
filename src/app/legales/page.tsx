import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS, DEFENSA_CONSUMIDOR_URL, LEGAL_UPDATED_AT } from "@/lib/business";

export const metadata: Metadata = {
  title: "Términos y Condiciones · Política de Privacidad",
  description:
    "Términos y condiciones de uso, política de privacidad y tratamiento de datos personales de Litoral Maq.",
};

export default function LegalesPage() {
  const mailto = `mailto:${BUSINESS.email}`;

  return (
    <main className="standard-page legal-page">
      <div className="page-heading">
        <span className="eyebrow orange">INFORMACIÓN LEGAL</span>
        <h1>Términos y Privacidad</h1>
        <p>Última actualización: {LEGAL_UPDATED_AT}</p>
      </div>

      <nav className="legal-index" aria-label="Secciones">
        <a href="#proveedor">Identificación del proveedor</a>
        <a href="#terminos">Términos y Condiciones</a>
        <a href="#privacidad">Política de Privacidad</a>
        <a href="#cookies">Cookies</a>
        <a href="#consumidor">Defensa del consumidor</a>
      </nav>

      <section id="proveedor" className="legal-section">
        <h2>1. Identificación del proveedor</h2>
        <ul>
          <li><strong>Nombre comercial:</strong> {BUSINESS.nombreComercial}</li>
          {BUSINESS.razonSocial && <li><strong>Razón social:</strong> {BUSINESS.razonSocial}</li>}
          {BUSINESS.cuit && <li><strong>CUIT:</strong> {BUSINESS.cuit}</li>}
          <li><strong>Domicilio comercial:</strong> {BUSINESS.domicilio}</li>
          <li><strong>Correo electrónico:</strong> <a href={mailto}>{BUSINESS.email}</a></li>
          <li><strong>Atención:</strong> {BUSINESS.horarios}</li>
        </ul>
      </section>

      <section id="terminos" className="legal-section">
        <h2>2. Términos y Condiciones</h2>

        <h3>2.1. Objeto y aceptación</h3>
        <p>
          Este sitio es el catálogo online de {BUSINESS.nombreComercial}. Al navegarlo, crear una cuenta o
          enviar una solicitud de compra, aceptás estos Términos y Condiciones y la Política de Privacidad
          que se detalla más abajo. Si no estás de acuerdo con ellos, no utilices el sitio.
        </p>

        <h3>2.2. La solicitud de compra no es una venta cerrada</h3>
        <p>
          El envío del formulario de checkout <strong>no perfecciona una compraventa ni implica cobro
          alguno</strong>. Se trata de una solicitud: {BUSINESS.nombreComercial} la recibe, verifica la
          disponibilidad real del producto, cotiza el envío si corresponde y se contacta para confirmar el
          total final y el medio de pago. La operación queda concluida recién cuando ambas partes confirman
          esos puntos.
        </p>

        <h3>2.3. Precios y disponibilidad</h3>
        <p>
          Los precios se expresan en pesos argentinos y son <strong>precios finales</strong>: el importe
          exhibido es el total a pagar por el producto, con los impuestos ya incluidos. No incluyen el costo
          de envío, que se cotiza por separado según el destino. Los precios y el stock publicados
          pueden variar sin previo aviso; el precio válido es el que se confirma al cerrar la operación. Si
          un producto figura disponible pero no lo está, te lo informamos y la solicitud queda sin efecto,
          sin costo para vos.
        </p>

        <h3>2.4. Entrega</h3>
        <p>
          Podés optar por el retiro en {BUSINESS.domicilio} —sin cargo y coordinado previamente— o por envío
          a domicilio. Los plazos de entrega son estimados y dependen del operador logístico. El riesgo de
          pérdida se transfiere con la entrega efectiva del producto.
        </p>

        <h3>2.5. Garantía</h3>
        <p>
          Los productos nuevos cuentan con la garantía legal prevista en los artículos 11 a 17 de la Ley
          24.240, además de la garantía de fábrica que otorgue cada marca. Para hacerla efectiva conservá la
          factura y comunicate a <a href={mailto}>{BUSINESS.email}</a>.
        </p>

        <h3>2.6. Derecho de revocación (arrepentimiento)</h3>
        <p>
          Al tratarse de una operación a distancia, tenés derecho a revocarla dentro de los <strong>10 días
          corridos</strong> contados desde la entrega del producto, sin necesidad de expresar motivo y sin
          costo alguno (art. 34 de la Ley 24.240 y Res. 424/2020). El producto debe devolverse en el mismo
          estado en que se recibió. Podés ejercer este derecho desde el{" "}
          <Link href="/arrepentimiento">Botón de Arrepentimiento</Link>.
        </p>

        <h3>2.7. Cuenta de usuario</h3>
        <p>
          Sos responsable de la veracidad de los datos que cargás y de resguardar tu contraseña. Podés
          solicitar la baja de tu cuenta escribiendo a <a href={mailto}>{BUSINESS.email}</a>.
        </p>

        <h3>2.8. Propiedad intelectual</h3>
        <p>
          Las marcas, logotipos, textos e imágenes del sitio pertenecen a {BUSINESS.nombreComercial} o a sus
          respectivos titulares. No está permitida su reproducción sin autorización previa por escrito.
        </p>

        <h3>2.9. Ley aplicable y jurisdicción</h3>
        <p>
          Estos términos se rigen por las leyes de la República Argentina. Ante cualquier controversia
          resultan competentes los tribunales ordinarios del domicilio del consumidor, conforme al artículo
          36 de la Ley 24.240.
        </p>
      </section>

      <section id="privacidad" className="legal-section">
        <h2>3. Política de Privacidad</h2>

        <h3>3.1. Responsable de la base de datos</h3>
        <p>
          {BUSINESS.razonSocial || BUSINESS.nombreComercial}, con domicilio en {BUSINESS.domicilio}, es el
          responsable del tratamiento de los datos personales que se recolectan en este sitio.
        </p>

        <h3>3.2. Qué datos recolectamos y para qué</h3>
        <ul>
          <li><strong>Nombre, email y teléfono:</strong> para identificarte y contactarte por tu solicitud.</li>
          <li><strong>Domicilio, localidad y código postal:</strong> únicamente cuando elegís envío, para cotizarlo y despacharlo.</li>
          <li><strong>Historial de pedidos:</strong> para que puedas consultar el estado de tus solicitudes.</li>
          <li><strong>Email y contraseña</strong> (o tu cuenta de Google, si elegís ese método): para gestionar tu acceso.</li>
        </ul>
        <p>
          No recolectamos datos sensibles en los términos del artículo 2 de la Ley 25.326, ni datos de
          tarjetas de crédito o débito: <strong>el sitio no procesa pagos</strong>.
        </p>

        <h3>3.3. Base legal</h3>
        <p>
          El tratamiento se funda en tu consentimiento y en que los datos resultan necesarios para el
          desarrollo de la relación comercial que iniciás al enviar una solicitud (art. 5, inc. 2, ap. a de
          la Ley 25.326). Completar el formulario es voluntario, pero sin esos datos no podemos procesar el
          pedido.
        </p>

        <h3>3.4. Con quién los compartimos</h3>
        <p>
          No vendemos ni cedemos datos personales con fines comerciales. Los compartimos únicamente con
          proveedores que nos prestan servicios necesarios para operar:
        </p>
        <ul>
          <li><strong>Supabase</strong> — alojamiento de la base de datos y gestión de cuentas.</li>
          <li><strong>Operadores logísticos</strong> (por ejemplo, Correo Andreani) — sólo los datos indispensables para despachar tu envío, y sólo si elegiste esa modalidad.</li>
        </ul>
        <p>
          También podremos revelarlos ante requerimiento fundado de autoridad judicial o administrativa
          competente.
        </p>

        <h3>3.5. Conservación y seguridad</h3>
        <p>
          Conservamos los datos mientras mantengas tu cuenta activa y, luego, durante los plazos exigidos
          por la normativa comercial y fiscal. Aplicamos medidas técnicas y organizativas razonables para
          proteger la información contra el acceso no autorizado, su alteración o su pérdida.
        </p>

        <h3>3.6. Tus derechos</h3>
        <p>
          Podés ejercer los derechos de acceso, rectificación, actualización y supresión de tus datos
          escribiendo a <a href={mailto}>{BUSINESS.email}</a>, acreditando tu identidad.
        </p>
        <p className="legal-callout">
          El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos
          en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés
          legítimo al efecto, conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº 25.326.
        </p>
        <p className="legal-callout">
          La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley
          Nº 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes
          resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de
          protección de datos personales.
        </p>
      </section>

      <section id="cookies" className="legal-section">
        <h2>4. Cookies</h2>
        <p>
          Este sitio <strong>no utiliza cookies publicitarias, de analítica ni de seguimiento de
          terceros</strong>. Sólo se emplean cookies técnicas, estrictamente necesarias para mantener tu
          sesión iniciada y conservar el contenido del carrito. Podés eliminarlas desde la configuración de
          tu navegador, con la consecuencia de que se cerrará tu sesión.
        </p>
      </section>

      <section id="consumidor" className="legal-section">
        <h2>5. Defensa del consumidor</h2>
        <p>
          Si tenés un reclamo, escribinos primero a <a href={mailto}>{BUSINESS.email}</a>: intentamos
          resolver todo por esa vía. También podés iniciar un reclamo ante la autoridad de aplicación.
        </p>
        <p>
          <a className="button secondary" href={DEFENSA_CONSUMIDOR_URL} target="_blank" rel="noopener noreferrer">
            Formulario de Defensa del Consumidor
          </a>
        </p>
      </section>
    </main>
  );
}
