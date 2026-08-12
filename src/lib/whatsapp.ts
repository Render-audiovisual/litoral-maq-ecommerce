const WHATSAPP_NUMBER = "5493794215065";

export function getWhatsAppUrl(message = "Hola, quiero consultar por los productos de Litoral Maq.") {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
