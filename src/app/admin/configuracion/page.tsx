"use client";

import { FormEvent, useState } from "react";

export default function AdminSettingsPage() {
  const [saved, setSaved] = useState(false);
  function submit(event: FormEvent) { event.preventDefault(); setSaved(true); }
  return <main className="admin-content"><div className="admin-heading"><div><span className="eyebrow orange">AJUSTES</span><h1>Configuración</h1><p>Preparación de envíos, pagos e integraciones.</p></div></div><div className="settings-grid"><form className="admin-card" onSubmit={submit}><h2>Envíos y retiro</h2><label>Nombre de sucursal<input defaultValue="Litoral Maq" /></label><label>Domicilio de retiro<input defaultValue="Pendiente de confirmar" /></label><label>Monto para envío gratis<input type="number" defaultValue="250000" /></label><label>Costo base de envío demo<input type="number" defaultValue="12500" /></label><button className="button primary">Guardar configuración</button>{saved && <div className="success-message">✓ Configuración guardada en esta sesión.</div>}</form><section className="admin-card integrations"><h2>Integraciones</h2>{[["Base de datos", "DATABASE_URL", "Pendiente"], ["Mercado Pago", "MP_ACCESS_TOKEN", "Pendiente"], ["Google Login", "GOOGLE_CLIENT_ID", "Pendiente"], ["Google Sheets", "GOOGLE_SHEETS_ID", "Datos iniciales cargados"], ["Imágenes", "STORAGE_*", "Pendiente"], ["Envíos", "SHIPPING_API_KEY", "Pendiente"]].map(([name, variable, status]) => <div key={name}><span className={status === "Pendiente" ? "integration-dot" : "integration-dot ready"} /><strong>{name}</strong><code>{variable}</code><small>{status}</small></div>)}</section></div></main>;
}
