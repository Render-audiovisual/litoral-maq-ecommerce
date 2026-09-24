# Recontacto por WhatsApp y pedidos vencidos — Plan de implementación

> **Para agentes:** SUB-SKILL requerida: superpowers:subagent-driven-development o superpowers:executing-plans. Los pasos usan checkboxes (`- [ ]`).

**Goal:** El equipo de Litoral Maq cierra ventas recontactando por WhatsApp desde "Ver detalle" del pedido en el panel, con un mensaje ya armado. Un pedido que se cancela a las 24 h sin pago desaparece del historial del cliente; si quiere seguir, hace un pedido nuevo desde la web.

**Architecture:** Solo frontend, sin migraciones. El botón de WhatsApp del panel ya existe (`recoveryWhatsAppUrl` en `src/app/admin/pedidos/page.tsx`, Wilson #83): se ajusta el texto del mensaje y la etiqueta. La ocultación en el historial del cliente es un filtro en `selectOwnOrders` (`src/lib/orders.ts`), que ya usan la página `/cuenta/pedidos` y el contador del header.

**Tech Stack:** Next.js, vitest (`npm run test:unit`), Playwright.

## Decisiones de Franco (2026-09-23)

- El WhatsApp NO va en el cuadro de compra del checkout: ese flujo queda igual (se revirtió el botón de esta rama).
- El aviso "Reservamos tu pedido por 24 horas" en el cuadro de compra se deja.
- Después de las 24 h el cliente rehace el pedido desde la web. No hay botón "Reactivar" ni "Generar pedido nuevo" en el panel.

## Global Constraints

- No tocar `supabase/` ni `.github/`.
- Textos de cara al cliente en español rioplatense.
- Un pedido "vencido" = `status === "cancelado"` sin pago acreditado (`paymentStatus` ausente, `pending` o `cancelled`). Pedidos cancelados que sí tuvieron pago (`approved`, `refunded`, `charged_back`) siguen visibles para el cliente.
- Trailer de commit: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## File Structure

- Modify `src/lib/orders.ts` + `src/lib/orders.test.ts` — filtro de pedidos vencidos (Tarea 1).
- Modify `src/lib/whatsapp.ts` + `src/lib/whatsapp.test.ts` — mensaje de recontacto (Tarea 2).
- Modify `src/app/admin/pedidos/page.tsx` — etiqueta del botón (Tarea 2).

---

### Task 1: El pedido vencido desaparece del historial del cliente

**Files:**
- Modify: `src/lib/orders.ts:9-14`
- Test: `src/lib/orders.test.ts`

**Interfaces:**
- Produces: `selectOwnOrders(orders, session)` deja de devolver pedidos vencidos (definición en Global Constraints). Firma sin cambios.

- [ ] **Step 1: Test que falla** — agregar en `src/lib/orders.test.ts`, dentro del `describe("selectOwnOrders", …)` (antes de su `});` de cierre):

```ts
  it("no muestra al cliente los pedidos vencidos sin pago, pero sí los cancelados con pago", () => {
    const own = { customerId: "customer-a@test.com", customerName: "A", email: "a@test.com" };
    const withExpired: Order[] = [
      { ...baseOrder, ...own, id: "vivo", status: "pendiente", paymentStatus: "pending" },
      { ...baseOrder, ...own, id: "vencido", status: "cancelado", paymentStatus: "cancelled" },
      { ...baseOrder, ...own, id: "vencido-legado", status: "cancelado" },
      { ...baseOrder, ...own, id: "reintegrado", status: "cancelado", paymentStatus: "refunded" },
    ];
    expect(selectOwnOrders(withExpired, sessionA).map((o) => o.id).sort()).toEqual(["reintegrado", "vivo"]);
  });
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run src/lib/orders.test.ts` → FAIL (devuelve también `vencido` y `vencido-legado`).

- [ ] **Step 3: Implementar** — en `src/lib/orders.ts`, reemplazar el cuerpo de `selectOwnOrders` por:

```ts
export function selectOwnOrders(orders: Order[], session: Session): Order[] {
  const sessionEmail = normalizeEmail(session.user.email);
  return orders.filter(
    (order) =>
      (order.customerId === session.user.id || normalizeEmail(order.email) === sessionEmail) &&
      !isExpiredUnpaidOrder(order),
  );
}

/**
 * Pedido cancelado sin haberse pagado (vencido a las 24 h). Al cliente no le
 * sirve verlo en su historial: si quiere seguir, hace un pedido nuevo. El panel
 * sí lo sigue mostrando para recontactar por WhatsApp.
 */
function isExpiredUnpaidOrder(order: Order) {
  const payment = order.paymentStatus ?? "pending";
  return order.status === "cancelado" && (payment === "pending" || payment === "cancelled");
}
```

- [ ] **Step 4: Correr y ver que pasa** — `npx vitest run src/lib/orders.test.ts` → todo PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orders.ts src/lib/orders.test.ts
git commit -m "feat(cuenta): ocultar al cliente los pedidos vencidos sin pago

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Mensaje de recontacto y botón en "Ver detalle"

**Files:**
- Modify: `src/lib/whatsapp.ts:44-58` (`getPendingOrderCustomerWhatsAppUrl`)
- Modify: `src/lib/whatsapp.test.ts` (test "abre el WhatsApp del cliente con el pedido pendiente y la reserva")
- Modify: `src/app/admin/pedidos/page.tsx:504-512` (etiqueta del botón)

**Interfaces:**
- Consumes/Produces: `getPendingOrderCustomerWhatsAppUrl(order: Order, phone?: string): string` — misma firma. Devuelve `""` sin teléfono. Si `order.status === "cancelado"` (pedido vencido) el texto no promete reserva.

- [ ] **Step 1: Tests que fallan** — en `src/lib/whatsapp.test.ts` reemplazar el test "abre el WhatsApp del cliente con el pedido pendiente y la reserva" por:

```ts
  it("recontacta al cliente con el pedido pendiente y le ofrece asesoría", () => {
    const order = {
      id: "LM-125",
      customerName: "Ana",
      phone: "+54 9 3794 11-2233",
      status: "pendiente",
      lines: [{ productId: "p1", productName: "Taladro", quantity: 1 }],
    } as Order;
    const url = new URL(getPendingOrderCustomerWhatsAppUrl(order));
    expect(url.pathname).toBe("/5493794112233");
    const text = url.searchParams.get("text") || "";
    expect(text).toContain("Hola Ana");
    expect(text).toContain("Vimos que solicitaste el pedido LM-125 por 1 × Taladro");
    expect(text).toContain("querés continuar con tu compra");
    expect(text).toContain("asesorar");
    expect(text).toContain("Corrientes Capital");
  });

  it("si el pedido venció, el mensaje no promete reserva y ofrece retomar la compra", () => {
    const order = {
      id: "LM-126",
      customerName: "Ana",
      phone: "3794112233",
      status: "cancelado",
      lines: [{ productId: "p1", productName: "Taladro", quantity: 1 }],
    } as Order;
    const text = new URL(getPendingOrderCustomerWhatsAppUrl(order)).searchParams.get("text") || "";
    expect(text).toContain("Vimos que solicitaste el pedido LM-126");
    expect(text).toContain("ya venció");
    expect(text).not.toContain("reservado");
    expect(text).toContain("retomemos");
  });

  it("sin teléfono no arma enlace", () => {
    const order = { id: "LM-127", lines: [] } as unknown as Order;
    expect(getPendingOrderCustomerWhatsAppUrl(order)).toBe("");
  });
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run src/lib/whatsapp.test.ts` → FAIL en los dos primeros tests nuevos.

- [ ] **Step 3: Implementar** — en `src/lib/whatsapp.ts` reemplazar el cuerpo de `getPendingOrderCustomerWhatsAppUrl` (líneas 45-58) por:

```ts
export function getPendingOrderCustomerWhatsAppUrl(order: Order, phone?: string) {
  const number = normalizeArgentineWhatsAppNumber(phone || order.phone);
  if (!number) return "";
  const products = order.lines
    .map((line) => `${line.quantity} × ${line.productName || line.productCode || line.productId}`)
    .join(", ");
  const expired = order.status === "cancelado";
  const message = [
    `Hola ${order.customerName || ""}, ¿cómo estás? Somos de Litoral Maq.`.replace("Hola ,", "Hola,"),
    expired
      ? `Vimos que solicitaste el pedido ${order.id} por ${products}. Ese pedido ya venció, pero si querés seguir con tu compra te asesoramos personalmente y lo resolvemos por acá.`
      : `Vimos que solicitaste el pedido ${order.id} por ${products} y queríamos ver si querés continuar con tu compra. Te podemos asesorar personalmente con lo que necesites.`,
    "Podés retirarlo en nuestro local de Corrientes Capital o te ayudamos a coordinar el envío.",
    expired ? "¿Querés que lo retomemos?" : "¿Seguimos con tu compra?",
  ].join("\n\n");
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
```

- [ ] **Step 4: Correr y ver que pasa** — `npx vitest run src/lib/whatsapp.test.ts` → todo PASS.

- [ ] **Step 5: Etiqueta del botón en el panel** — en `src/app/admin/pedidos/page.tsx` (dentro del bloque `{recoveryWhatsAppUrl && (…)}` de la columna Cliente) cambiar el texto `Contactar al cliente` del `<a className="button whatsapp-button">` por `Contactar por WhatsApp`. No tocar el `<small>Contactar al cliente</small>` de la tabla (es el aviso de seguimiento).

- [ ] **Step 6: Verificar** — `npx tsc --noEmit && npm run lint && npm run test:unit` y `npx playwright test tests/e2e/admin-orders.spec.ts tests/e2e/checkout-layout.spec.ts tests/e2e/assisted-checkout.spec.ts tests/e2e/guest-account-offer.spec.ts` → todo verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/whatsapp.ts src/lib/whatsapp.test.ts src/app/admin/pedidos/page.tsx
git commit -m "feat(admin): mensaje de recontacto por WhatsApp para pedidos pendientes y vencidos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Efecto al publicar

Igual que el plan anterior: al desplegar `main` la función `order-notifications` se actualiza y el primer cron cancela los 4 pedidos vencidos. Con este plan esos 4 desaparecen del historial de sus clientes y el panel los muestra en el filtro "Vencidos" con el botón "Contactar por WhatsApp" para recontactar.

## Self-review

- Cobertura: WhatsApp en detalle del panel con mensaje armado (T2), pedido vencido fuera del historial del cliente (T1), rehacer desde la web (sin código), checkout sin WhatsApp (revertido).
- Tipos: `selectOwnOrders` y `getPendingOrderCustomerWhatsAppUrl` mantienen firma.
