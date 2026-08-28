/**
 * Datos identificatorios del proveedor, exigidos por la Res. 104/2005 (que
 * incorpora la Res. Mercosur 21/04) y el art. 4 de la Ley 24.240.
 *
 * Punto único de verdad: el footer y las páginas legales leen de acá. Los
 * campos que todavía no están confirmados quedan vacíos a propósito y no se
 * renderizan — es preferible mostrar de menos que publicar una identidad
 * fiscal inventada. Completar `razonSocial` y `cuit` con los datos reales
 * antes de salir a producción.
 */
export const BUSINESS = {
  nombreComercial: "Litoral Maq",
  razonSocial: "", // TODO: completar con la razón social inscripta.
  cuit: "", // TODO: completar con el CUIT (formato 00-00000000-0).
  email: "maqlitoral@gmail.com",
  domicilio: "Sáenz 1587, Corrientes, Argentina",
  mapsUrl: "https://maps.app.goo.gl/3E1dMK6wu6XEVRzR8",
  horarios: "Lun a Vie 8 a 17 hs · Sáb 8:30 a 12:30 hs",
} as const;

/** Formulario oficial de Defensa del Consumidor (Res. 424/2020, art. 2). */
export const DEFENSA_CONSUMIDOR_URL =
  "https://autogestion.produccion.gob.ar/consumidores";

/** Última revisión del contenido legal publicado. */
export const LEGAL_UPDATED_AT = "28 de agosto de 2026";
