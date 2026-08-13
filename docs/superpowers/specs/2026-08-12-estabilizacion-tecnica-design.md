# Estabilización técnica del entorno — Diseño

**Fecha:** 2026-08-12
**Estado:** Aprobado

## Objetivo

Dejar el repo en un estado sano — entorno local funcional, sin vulnerabilidades
`high`/`critical`, sin secretos filtrados — antes de retomar trabajo de
funcionalidad.

## Fuera de alcance

Decidir si producción pasa de `NEXT_PUBLIC_PERSISTENCE_PROVIDER=local` a
`supabase` en el deploy de Hostinger. Es una decisión de negocio/funcional
independiente; este plan no cambia el comportamiento de la app en producción.

## Contexto (diagnóstico previo)

- `npx tsc --noEmit` y `npm run lint` pasan limpio.
- `npm run build` compila y genera los 514 paths estáticos sin errores.
- `npm test` (vitest) **falla en local**: Node 20.17.0 es menor al mínimo que
  requiere el toolchain de `vite@8.2.0`/`rolldown` (`^20.19 || >=22.12`),
  produciendo `Cannot find native binding`.
- `npm audit` reporta 5 vulnerabilidades `high`: `js-yaml`, `nanoid`,
  `postcss`, `sharp` (estas dos últimas arrastradas por `next@16.2.12`). El
  fix de `postcss`/`sharp` requiere subir `next` a `16.3.0`, fuera del pin
  exacto actual en `package.json`.
- `REPORTE_ETAPA_7.md` (commit inicial, ya pusheado) contiene en texto plano
  el email y password real de un admin de producción, más la URL real del
  proyecto Supabase. El repo `Render-audiovisual/litoral-maq-ecommerce` es
  **público** en GitHub.

## Plan

### 1. Rotar credencial filtrada

- El usuario rota la contraseña del admin real (ver `REPORTE_ETAPA_7.md` antes
  de su redacción para el email exacto) en el dashboard de Supabase — acción
  externa, fuera del alcance de este agente.
- Reemplazar el email/password en texto plano de `REPORTE_ETAPA_7.md` por un
  placeholder, conservando el resto del reporte como registro histórico.
- Sin reescritura de historia de git (la password vieja queda en el
  historial pero deja de ser válida una vez rotada).

### 2. Actualizar Node local

- Subir a **Node 22 LTS** (no solo el mínimo 20.19 — el propio build de Next
  ya avisa que `@supabase/supabase-js` deprecará soporte para Node 20).
- Agregar `.nvmrc` con `22` en la raíz del repo.
- Actualizar `.github/workflows/deploy-hostinger.yml`: cambiar el `with:` de
  `actions/setup-node@v7` de `node-version: 20` a `node-version-file:
  .nvmrc`, para que CI y local no vuelvan a desalinearse.
- Reinstalar `node_modules` tras el cambio de versión.

### 3. Resolver vulnerabilidades npm

- `npm audit fix --force` → sube `next` de `16.2.12` a `16.3.0` (resuelve
  `postcss`/`sharp`; `js-yaml`/`nanoid` son transitivos de `eslint`/`vite` y
  salen con el `audit fix` normal, sin `--force`).
- Actualizar el pin exacto en `package.json` (`"next": "16.2.12"` →
  `"16.3.0"`).
- Confirmar `npm audit` → 0 `high`/`critical` remanentes.

### 4. Verificación final

Checklist de salida — todo debe quedar verde en el mismo entorno (Node 22
local, deps actualizadas):

- `node -v` → 22.x
- `npm audit` → 0 high/critical
- `npx tsc --noEmit`
- `npm run lint`
- `npm test` (vitest corre sin el error de rolldown)
- `npm run build`
- `npm run build:hostinger`
- `npm run build:admin`
- `npm run validate:separation`
- `REPORTE_ETAPA_7.md` sin credenciales reales

## Riesgos / notas

- El bump de `next` 16.2.12 → 16.3.0 es menor, pero hay que re-correr todo el
  checklist de verificación después para confirmar que no rompe nada (ya se
  verificó que 16.2.12 buildea limpio como baseline).
- Cambiar el Node de CI (`deploy-hostinger.yml`) toca el pipeline de
  producción — validar que el workflow sigue corriendo antes de mergear a
  `main`.
