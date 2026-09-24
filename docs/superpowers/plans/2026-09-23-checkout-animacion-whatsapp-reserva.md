# Checkout: entrada lateral, WhatsApp y reserva de 24 h — Plan de implementación

> **Para agentes:** SUB-SKILL requerida: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`).

**Goal:** Que el formulario del checkout entre desde la izquierda y el cuadro "Tu pedido" desde la derecha (el cuadro conserva su comportamiento sticky al scrollear), sumar un botón de WhatsApp dentro del checkout y avisar de la reserva de 24 h antes de crear el pedido.

**Architecture:** Todo es frontend sobre lo que Wilson ya dejó en `main` (#83 y #84). No hay migraciones ni cambios en Edge Functions. La animación es CSS puro sobre las clases que ya existen (`.checkout-layout > .checkout-steps` / `.order-summary`). El enlace de WhatsApp es una función pura en `src/lib/whatsapp.ts`, con test unitario.

**Tech Stack:** Next.js (App Router, ver `node_modules/next/dist/docs/` si se toca algo de Next), CSS global en `src/app/globals.css`, vitest (`npm run test:unit`), Playwright (`npm run test:e2e`).

## Estado de partida (verificado en `main` @ cd62934, 2026-09-23)

| Pedido de Franco | Estado hoy | Qué falta |
| --- | --- | --- |
| Formulario entra por la izquierda, cuadro por la derecha | Ya hay keyframes `checkout-form-in` / `checkout-summary-in` de 28 px, casi imperceptibles. Además `animation-fill-mode: both` deja un `transform` fijo en el `<aside>`, y con "reducir animaciones" activo del sistema se anulan | **Tarea 1** |
| Cuadro de compra mantiene el sticky al scrollear | `.order-summary.sticky { position: sticky; top: 115px }` | Blindarlo con test (**Tarea 1**) |
| Botón de WhatsApp para contactar por la venta | Existe en `/checkout/exito`, `/checkout/pendiente`, `/checkout/error` y el panel (`getPendingOrderCustomerWhatsAppUrl`). **No existe dentro del checkout** | **Tarea 2** |
| Pedido guardado 24 h, seguimiento a la hora | Migración `20260922143000_pending_order_lifecycle.sql` aplicada: `expires_at` = +24 h, `follow_up_at` a la hora, cancelación automática. Cron `*/5` activo en Supabase. El cliente solo lo lee después de crear el pedido | Avisarlo en el checkout (**Tarea 3**). Ojo: hoy **no corre** en producción porque la Edge Function `order-notifications` desplegada es la vieja. Ver "Efecto al publicar" |
| Apellido y DNI en campos separados | Hecho en #84 (`firstName`, `lastName`, `dni` con validación 7–8 dígitos; el DNI se ve en el panel) | Nada. Solo se verifica en la Tarea 4 |

## Global Constraints

- Ramas de trabajo salen de `origin/main`; se despliega `origin/main`, no la rama.
- No tocar `supabase/` ni `.github/`.
- La animación debe verse aunque el sistema tenga "reducir animaciones" (decisión ya tomada para el hero y los testimonios; queda documentada en un comentario CSS).
- El cuadro "Tu pedido" NO puede quedar con `transform`, `overflow: hidden` ni `overflow: auto` en él ni en sus ancestros al terminar la animación: rompen `position: sticky`.
- Textos de cara al cliente en español rioplatense, sin emojis nuevos fuera del mensaje de WhatsApp.
- Un commit por tarea, con el trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## Efecto al publicar (avisar a Franco, no es una tarea de código)

Al desplegar `main` se actualiza la función `order-notifications`; desde el siguiente cron (5 min) empieza a correr `process_pending_order_lifecycle()`. Hoy hay **5 pedidos pendientes; 4 ya pasaron las 24 h y se van a cancelar solos** en esa primera corrida, y 1 queda marcado para seguimiento. Es el comportamiento pedido, pero conviene que el equipo lo sepa antes.

## File Structure

- Modify `src/app/globals.css` — keyframes y reglas del checkout (Tarea 1) y estilo de la nota de reserva (Tarea 3).
- Modify `src/lib/whatsapp.ts` — nueva `getCheckoutHelpWhatsAppUrl` (Tarea 2).
- Modify `src/lib/whatsapp.test.ts` — test de esa función (Tarea 2).
- Modify `src/app/checkout/page.tsx` — botón de WhatsApp y nota de reserva dentro del `<aside>` (Tareas 2 y 3).
- Create `tests/e2e/checkout-layout.spec.ts` — animación lateral, sticky, WhatsApp y reserva (Tareas 1–3).

---

### Task 1: Entrada lateral del formulario y del cuadro de compra

**Files:**
- Modify: `src/app/globals.css:331-332` (reglas de animación), `:378-385` (keyframes), `:881-889` (reduced-motion)
- Create: `tests/e2e/checkout-layout.spec.ts`

**Interfaces:**
- Produces: animaciones CSS `checkout-form-in` (desde la izquierda) y `checkout-summary-in` (desde la derecha); sin `transform` residual al terminar.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/e2e/checkout-layout.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

async function openCheckout(page: Page) {
  await page.goto("/productos?q=3403");
  await page.locator(".product-card").first().getByRole("button", { name: "Agregar al carrito" }).click();
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Confirmá tu pedido" })).toBeVisible();
}

test("el formulario entra por la izquierda y el cuadro por la derecha, aun con reducir animaciones", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCheckout(page);

  const from = (selector: string) =>
    page.locator(selector).evaluate((el) => {
      const animation = el.getAnimations()[0];
      const frames = (animation?.effect as KeyframeEffect | undefined)?.getKeyframes() ?? [];
      return String(frames[0]?.transform ?? "");
    });

  // translate3d(-Npx, 0, 0) → sale de la izquierda; translate3d(Npx, 0, 0) → sale de la derecha.
  expect(await from(".checkout-layout > .checkout-steps")).toMatch(/translate3d\(-\d+px/);
  expect(await from(".checkout-layout > .order-summary")).toMatch(/translate3d\(\d+px/);
});

test("al terminar la animación el cuadro no queda con transform y sigue pegado al hacer scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openCheckout(page);
  const summary = page.locator(".checkout-layout > .order-summary");

  await expect.poll(() => summary.evaluate((el) => getComputedStyle(el).transform), { timeout: 3000 }).toBe("none");
  await expect(summary).toHaveCSS("position", "sticky");

  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(async () => Math.round((await summary.boundingBox())!.y)).toBe(115);
});
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx playwright test tests/e2e/checkout-layout.spec.ts`
Expected: FAIL. El primer test falla porque con `reducedMotion: "reduce"` `getAnimations()` está vacío (`animation: none`); el segundo falla porque `fill-mode: both` deja `transform: matrix(1, 0, 0, 1, 0, 0)` en vez de `none`.

- [ ] **Step 3: Implementar en `src/app/globals.css`**

Reemplazar las dos reglas de animación (líneas 331-332) por:

```css
/* Entrada lateral: el formulario llega desde la izquierda y el cuadro de compra
   desde la derecha. `backwards` (no `both`) a propósito: al terminar no queda un
   transform en el <aside>, que es lo que mantiene limpio su `position: sticky`. */
.checkout-layout > .checkout-steps { animation: checkout-form-in .75s .06s cubic-bezier(.22, 1, .36, 1) backwards; }
.checkout-layout > .order-summary { animation: checkout-summary-in .75s .16s cubic-bezier(.22, 1, .36, 1) backwards; }
/* `clip` (no `hidden`): recorta el desborde horizontal durante la entrada sin crear
   un contenedor de scroll, así el sticky del cuadro sigue funcionando. */
.checkout-page { overflow-x: clip; }
```

Reemplazar los keyframes (líneas 378-385) por:

```css
@keyframes checkout-form-in {
  from { opacity: 0; transform: translate3d(-96px, 0, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes checkout-summary-in {
  from { opacity: 0; transform: translate3d(96px, 0, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}
```

En el bloque `@media (prefers-reduced-motion: reduce)` (línea ~881) quitar `.checkout-layout > .checkout-steps,` y `.checkout-layout > .order-summary` de la lista de `animation: none`, dejando:

```css
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .spinner { animation: none; }
  .commerce-hero-copy > *,
  .hero-promo-slider,
  .checkout-page .page-heading { animation: none; }
  /* El formulario y el cuadro de compra se animan igual con "reducir animaciones":
     es una entrada única de 0,75 s, sin bucle, y es parte del diseño pedido. */
  .form-card, .order-summary, .delivery-options label { transition: none; }
}
```

En móvil (`@media` de la línea ~711) no se toca: sigue `checkout-mobile-in` vertical de 18 px porque ahí es una sola columna.

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `npx playwright test tests/e2e/checkout-layout.spec.ts`
Expected: 2 passed.

- [ ] **Step 5: Probar a ojo en local**

Run: `npm run dev`, abrir http://127.0.0.1:3000/checkout con un producto en el carrito, recargar y mirar que el formulario entre desde la izquierda y el cuadro desde la derecha; scrollear y confirmar que el cuadro queda pegado. Repetir en ancho de celular (DevTools, 390 px): sin scroll horizontal.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css tests/e2e/checkout-layout.spec.ts
git commit -m "feat(checkout): entrada lateral del formulario y del cuadro de compra

El formulario llega desde la izquierda y el cuadro desde la derecha. El fill-mode
pasa a backwards para no dejar un transform que estorbe al sticky, y el checkout
ignora 'reducir animaciones' igual que el hero y los testimonios.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Botón de WhatsApp dentro del checkout

**Files:**
- Modify: `src/lib/whatsapp.ts` (agregar función después de `getWhatsAppUrl`, línea ~34)
- Modify: `src/lib/whatsapp.test.ts` (agregar `describe` al final)
- Modify: `src/app/checkout/page.tsx` (import y `<aside>`, después del `<small>` final, línea ~782)
- Modify: `src/app/globals.css` (junto a `.whatsapp-button`, línea ~421)
- Modify: `tests/e2e/checkout-layout.spec.ts`

**Interfaces:**
- Consumes: `getWhatsAppUrl(message: string): string` (ya existe), `Order["lines"]` no se usa: el checkout trabaja con el carrito (`cart`: `{ productId, quantity }[]`) y ya resuelve nombres.
- Produces: `getCheckoutHelpWhatsAppUrl(items: { name: string; quantity: number }[]): string`.

- [ ] **Step 1: Escribir el test unitario que falla**

Agregar al final de `src/lib/whatsapp.test.ts`, y sumar `getCheckoutHelpWhatsAppUrl` al import de `./whatsapp`:

```ts
describe("ayuda por WhatsApp desde el checkout", () => {
  it("arma el mensaje con los productos del carrito", () => {
    const url = new URL(getCheckoutHelpWhatsAppUrl([
      { name: "Taladro", quantity: 2 },
      { name: "Amoladora", quantity: 1 },
    ]));
    expect(url.pathname).toBe("/5493794215065");
    const text = url.searchParams.get("text") || "";
    expect(text).toContain("necesito ayuda para completar mi compra");
    expect(text).toContain("• 2 × Taladro");
    expect(text).toContain("• 1 × Amoladora");
  });

  it("sin productos manda una consulta genérica", () => {
    const text = new URL(getCheckoutHelpWhatsAppUrl([])).searchParams.get("text") || "";
    expect(text).toContain("necesito ayuda para completar mi compra");
    expect(text).not.toContain("•");
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/lib/whatsapp.test.ts`
Expected: FAIL (`getCheckoutHelpWhatsAppUrl is not a function`).

- [ ] **Step 3: Implementar la función**

En `src/lib/whatsapp.ts`, después de `getWhatsAppUrl`:

```ts
/** Ayuda desde el checkout: todavía no hay pedido, se comparte lo que hay en el carrito. */
export function getCheckoutHelpWhatsAppUrl(items: { name: string; quantity: number }[]) {
  const products = items.map((item) => `• ${item.quantity} × ${item.name}`).join("\n");
  return getWhatsAppUrl([
    "👋 ¡Hola! Estoy en la web de Litoral Maq y necesito ayuda para completar mi compra.",
    products && `🛒 *Mi carrito:*\n${products}`,
    "¿Me pueden dar una mano? ¡Gracias! 😊",
  ].filter(Boolean).join("\n\n"));
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/lib/whatsapp.test.ts`
Expected: todos PASS.

- [ ] **Step 5: Ver cómo el checkout obtiene el nombre de cada línea del carrito**

Run: `grep -n "products\|productName\|snapshotOrderLines" src/app/checkout/page.tsx | head -20`
Usar exactamente el mismo origen de nombres que ya usa `snapshotOrderLines(cart, …)` (el resultado tiene `productName` y `quantity`). Si el archivo ya calcula esas líneas antes del `return`, reutilizarlas; si no, calcular `const helpItems = snapshotOrderLines(cart, products).map((line) => ({ name: line.productName ?? line.productId, quantity: line.quantity }));` arriba del `return`, con los mismos argumentos que se le pasan a `snapshotOrderLines` en `submit` (línea ~284).

- [ ] **Step 6: Agregar el botón al checkout**

En `src/app/checkout/page.tsx`: importar `getCheckoutHelpWhatsAppUrl` desde `@/lib/whatsapp` y, dentro del `<aside>`, justo antes de `</aside>`:

```tsx
          <a
            className="button whatsapp-button full"
            href={getCheckoutHelpWhatsAppUrl(helpItems)}
            target="_blank"
            rel="noopener noreferrer"
          >
            ¿Dudas? Escribinos por WhatsApp
          </a>
```

En `src/app/globals.css`, debajo de `.whatsapp-button:hover`:

```css
.order-summary .whatsapp-button { margin: 14px 0 0; }
```

- [ ] **Step 7: Agregar el test e2e**

En `tests/e2e/checkout-layout.spec.ts`:

```ts
test("el checkout ofrece WhatsApp con el carrito ya armado", async ({ page }) => {
  await openCheckout(page);
  const link = page.getByRole("link", { name: /Escribinos por WhatsApp/ });
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href")) ?? "";
  expect(href).toContain("https://wa.me/5493794215065?text=");
  expect(decodeURIComponent(href)).toContain("Mi carrito");
});
```

- [ ] **Step 8: Correr todo lo de esta tarea**

Run: `npx vitest run src/lib/whatsapp.test.ts && npx playwright test tests/e2e/checkout-layout.spec.ts`
Expected: todo PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/whatsapp.ts src/lib/whatsapp.test.ts src/app/checkout/page.tsx src/app/globals.css tests/e2e/checkout-layout.spec.ts
git commit -m "feat(checkout): botón de WhatsApp con el carrito dentro del checkout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Avisar la reserva de 24 h antes de crear el pedido

**Files:**
- Modify: `src/app/checkout/page.tsx` (`<aside>`, entre el `<button>` de envío y el `<small>`, línea ~776)
- Modify: `src/app/globals.css`
- Modify: `tests/e2e/checkout-layout.spec.ts`

**Interfaces:**
- Consumes: nada nuevo. El plazo real (1 h seguimiento, 24 h cancelación) lo aplica la base con `process_pending_order_lifecycle()`; acá solo se informa.

- [ ] **Step 1: Escribir el test que falla**

En `tests/e2e/checkout-layout.spec.ts`:

```ts
test("el checkout avisa que el pedido se reserva 24 horas", async ({ page }) => {
  await openCheckout(page);
  await expect(page.locator(".order-summary .reservation-note")).toContainText("24 horas");
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx playwright test tests/e2e/checkout-layout.spec.ts -g "24 horas"`
Expected: FAIL (no existe `.reservation-note`).

- [ ] **Step 3: Implementar**

En el `<aside>`, entre el `<button>` de enviar y el `<small>`:

```tsx
          <p className="reservation-note">
            Reservamos tu pedido por 24 horas. Si en ese plazo no se acredita el pago, se cancela solo.
          </p>
```

En `src/app/globals.css`, debajo de `.order-summary > small`:

```css
.order-summary .reservation-note { margin: 0 0 12px; text-align: center; color: var(--navy); font-size: 14px; font-weight: 650; }
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx playwright test tests/e2e/checkout-layout.spec.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/checkout/page.tsx src/app/globals.css tests/e2e/checkout-layout.spec.ts
git commit -m "feat(checkout): avisar la reserva de 24 horas antes de pagar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Verificación completa y publicación

**Files:** ninguno nuevo.

- [ ] **Step 1: Suite completa**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit && npx playwright test`
Expected: todo verde. Si un test viejo falla por el texto nuevo del checkout (`Escribinos por WhatsApp`, nota de 24 horas), ajustar solo ese test, no el código.

- [ ] **Step 2: Verificar apellido y DNI**

En `npm run dev`, en `/checkout`: los campos Nombre, Apellido y DNI son distintos, obligatorios, y el DNI rechaza menos de 7 o más de 8 dígitos. Ya lo cubren `tests/e2e/assisted-checkout.spec.ts` y `guest-account-offer.spec.ts`.

- [ ] **Step 3: Franco prueba en local**

Franco recorre el checkout en escritorio y en celular (animación, sticky, botón de WhatsApp, nota de 24 h). **No se pushea hasta su OK.**

- [ ] **Step 4: Publicar con su OK**

```bash
git push -u origin feat/checkout-animacion-whatsapp
gh pr create --base main --title "Checkout: entrada lateral, WhatsApp y aviso de reserva" --body "<resumen de las 3 tareas + aviso de los 4 pedidos que se cancelan al activarse el ciclo>"
```

Con los checks en verde y el OK de Franco: merge a `main`. Eso dispara el deploy completo: funciones `payment-create`, `order-notifications` y `mercado-pago-webhook` + Hostinger. El token de Supabase ya fue comprobado con el workflow manual "Comprobar token de Supabase".

- [ ] **Step 5: Confirmar después del deploy**

En Supabase (solo lectura): `select jobname, active from cron.job;` sigue activo y `select count(*) from public.orders where payment_status='pending' and status='pendiente';` baja de 5 a 1. Confirmar que el tag `supabase-last-deploy` se movió al commit publicado.

## Fuera de alcance (a decidir por Franco)

- PR #61 (monitoreo de Edge Functions): toca funciones y está 40 commits atrás de `main`. Si se quiere publicar junto, hay que actualizarla contra `main` primero.
- Seguimiento automático al cliente a la hora: hoy solo se marca `follow_up_at` y el equipo escribe por WhatsApp desde el panel. Un correo o mensaje automático sería otra tarea.

## Self-review

- Cobertura: animación lateral (T1), sticky (T1 test), botón WhatsApp (T2), reserva 24 h y seguimiento 1 h (T3 + estado de partida + aviso de despliegue), apellido y DNI (ya hechos, verificación en T4).
- Sin placeholders, salvo el cuerpo del PR en T4 Step 4, que se redacta al publicar con el resultado real de las pruebas.
- Tipos: `getCheckoutHelpWhatsAppUrl(items: { name: string; quantity: number }[])` se usa igual en T2 (test, función y página).
