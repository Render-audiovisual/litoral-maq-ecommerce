# Estabilización Técnica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el repo en un estado sano — sin credenciales filtradas, sin vulnerabilidades npm `high`/`critical`, y con el toolchain local (Node/vitest) funcionando — antes de retomar trabajo de funcionalidad.

**Architecture:** No hay cambios de arquitectura de aplicación. Es trabajo de higiene: purgar un secreto de un doc, fijar la versión de Node en `.nvmrc` + CI, y subir `next` a la versión que resuelve las vulnerabilidades reportadas por `npm audit`.

**Tech Stack:** Node.js, npm, nvm-windows (gestor de versiones de Node en Windows), Next.js 16, vitest, ESLint, TypeScript.

## Global Constraints

- No reescribir historia de git (decisión tomada en el spec) — la password vieja queda en el historial pero se rota para que deje de servir.
- `NEXT_PUBLIC_PERSISTENCE_PROVIDER` en el deploy de Hostinger se mantiene en `local` — no se toca ese comportamiento en este plan.
- Node objetivo: **22 LTS** (no solo el mínimo 20.19 — `@supabase/supabase-js` ya avisa que deprecará Node 20).
- `next` objetivo tras el fix de vulnerabilidades: **16.3.0** (pin exacto, igual que el actual `16.2.12`).
- Checklist de salida (debe quedar verde en Node 22, deps actualizadas): `node -v` → 22.x; `npm audit` → 0 high/critical; `npx tsc --noEmit`; `npm run lint`; `npm test`; `npm run build`; `npm run build:hostinger`; `npm run build:admin`; `npm run validate:separation`; `REPORTE_ETAPA_7.md` sin credenciales reales.

---

### Task 1: Purgar la credencial filtrada de REPORTE_ETAPA_7.md

**Prerequisito manual (fuera de este repo):** antes de este task, el usuario debe haber rotado la contraseña del admin real (`renderctes@gmail.com`) en el dashboard de Supabase (Project Settings → Auth → Users → reset password). Este plan no puede hacer esa parte — es una acción en un sistema externo. Confirmar con el usuario que ya la rotó antes de ejecutar este task.

**Files:**
- Modify: `REPORTE_ETAPA_7.md`

**Interfaces:** Ninguna — es edición de un archivo Markdown, no afecta código.

- [ ] **Step 1: Confirmar con el usuario que la password ya fue rotada en Supabase**

No es un comando — es una pregunta directa al usuario antes de tocar el archivo. Si todavía no la rotó, esperar a que lo haga antes de seguir.

- [ ] **Step 2: Verificar las apariciones actuales del secreto**

Run: `grep -n "renderctes@gmail.com\|LitoralMaq2026!" REPORTE_ETAPA_7.md`

Expected: varias líneas con coincidencias (email en la sección "Primer admin real", en el bloque SQL de promoción, en la sección de verificación funcional, y en "Próximos pasos"; password solo en la línea `- Contraseña: LitoralMaq2026!`).

- [ ] **Step 3: Redactar el email real**

Reemplazar **todas** las apariciones de `renderctes@gmail.com` en `REPORTE_ETAPA_7.md` por `[email-admin-redactado]` (edición con reemplazo global, no una por una).

- [ ] **Step 4: Redactar la password real**

Reemplazar la línea:

```
- Contraseña: LitoralMaq2026!
```

por:

```
- Contraseña: [redactada — rotada tras detectar filtración, ver commit de estabilización técnica]
```

- [ ] **Step 5: Verificar que no queden coincidencias**

Run: `grep -n "renderctes@gmail.com\|LitoralMaq2026!" REPORTE_ETAPA_7.md`

Expected: sin salida (ninguna coincidencia).

- [ ] **Step 6: Commit**

```bash
git add REPORTE_ETAPA_7.md
git commit -m "$(cat <<'EOF'
Redacta credencial de admin filtrada en REPORTE_ETAPA_7.md

La password quedó en texto plano en un reporte commiteado a un repo
público. Se rotó en Supabase y se redacta del historial hacia
adelante (sin reescribir commits previos).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Fijar Node 22 LTS en local y en CI (requiere acción manual del usuario)

**Nota para quien ejecute este plan:** este task no se puede delegar a un subagente sin supervisión — instalar/cambiar la versión global de Node en Windows requiere una terminal nueva después de instalar `nvm-windows` (el cambio de `PATH` no lo ve la sesión de shell actual). Ejecutar los comandos de instalación con el usuario presente, o pedirle que confirme cada paso que toque su máquina.

**Files:**
- Create: `.nvmrc`
- Modify: `.github/workflows/deploy-hostinger.yml:27-30`

**Interfaces:** Ninguna — son archivos de configuración de entorno/CI, no código de aplicación.

- [ ] **Step 1: Crear `.nvmrc`**

Crear el archivo `.nvmrc` en la raíz del repo con este contenido exacto:

```
22
```

- [ ] **Step 2: Commit de `.nvmrc`**

```bash
git add .nvmrc
git commit -m "$(cat <<'EOF'
Fija Node 22 LTS como versión del proyecto

Node 20.17 local queda por debajo del mínimo que exige el toolchain
de vitest/vite (^20.19 || >=22.12), rompiendo `npm test` en local.
Next avisa además que @supabase/supabase-js deprecará Node 20.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Actualizar el workflow de CI para leer `.nvmrc`**

En `.github/workflows/deploy-hostinger.yml`, el bloque actual (líneas 26-30) es:

```yaml
      - name: Preparar Node.js
        uses: actions/setup-node@v7
        with:
          node-version: 20
          cache: npm
```

Reemplazar por:

```yaml
      - name: Preparar Node.js
        uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
```

- [ ] **Step 4: Commit del workflow**

```bash
git add .github/workflows/deploy-hostinger.yml
git commit -m "$(cat <<'EOF'
CI: lee la versión de Node desde .nvmrc

Evita que local y CI vuelvan a desalinearse en la versión de Node —
antes el workflow tenía node-version: 20 hardcodeado mientras el
mínimo real que exige el toolchain es 20.19+.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Instalar nvm-windows (no está presente en esta máquina)**

Confirmado en el diagnóstico: no hay `nvm` ni `fnm` instalados; Node actual (`v20.17.0`) fue instalado con el paquete winget `OpenJS.NodeJS.20`.

Run: `winget install --id CoreyButler.NVMforWindows --source winget --accept-source-agreements --accept-package-agreements`

Expected: instalación exitosa (código de salida 0).

- [ ] **Step 6: Desinstalar el Node global anterior para evitar que compita en el PATH con nvm-windows**

Run: `winget uninstall --id OpenJS.NodeJS.20 --source winget`

Expected: desinstalación exitosa.

- [ ] **Step 7: Abrir una terminal NUEVA**

El instalador de nvm-windows actualiza variables de entorno (`NVM_HOME`, `NVM_SYMLINK`, `PATH`) que la sesión de shell actual no recarga. Cerrar esta terminal y abrir una nueva antes de seguir.

- [ ] **Step 8: Instalar y activar Node 22 con nvm**

En la terminal nueva:

```bash
nvm install 22
nvm use 22
```

Expected: `nvm use 22` reporta `Now using node v22.x.x (64-bit)`.

- [ ] **Step 9: Verificar la versión activa**

Run: `node -v`

Expected: `v22.x.x` (cualquier patch de la serie 22).

- [ ] **Step 10: Reinstalar dependencias del proyecto con el Node nuevo**

```bash
cd "c:/Users/Franco/litoral-maq-ecommerce"
rm -rf node_modules
npm install
```

Expected: instala sin el warning `EBADENGINE` que aparecía antes para `eslint-visitor-keys`/`rolldown`/`vite`.

- [ ] **Step 11: Confirmar que vitest ya corre**

Run: `npx vitest run`

Expected: la suite corre y reporta tests pasados/fallados normalmente — sin el error `Cannot find native binding` / `Cannot find module '@rolldown/binding-wasm32-wasi'` que aparecía con Node 20.17.

---

### Task 3: Resolver las 5 vulnerabilidades npm `high`

**Depende de:** Task 2 completado (Node 22 activo — `npm audit fix --force` va a reinstalar paquetes y conviene hacerlo ya en el entorno definitivo).

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:** Ninguna — son manifiestos de dependencias.

- [ ] **Step 1: Confirmar el estado actual de las vulnerabilidades**

Run: `npm audit`

Expected: 5 vulnerabilidades `high` — `js-yaml` (vía `eslint`→`@eslint/eslintrc`), `nanoid` (vía `next`→`postcss` y `vitest`→`vite`→`postcss`), `postcss` y `sharp` (ambas vía `next@16.2.12`, requieren subir a `next@16.3.0`).

- [ ] **Step 2: Resolver `js-yaml` y `nanoid` (no requieren tocar `next`)**

Run: `npm audit fix`

Expected: dependencias transitivas de `eslint`/`vite` actualizadas; el resumen final debe bajar de 5 a 2 vulnerabilidades `high` (quedan `postcss`/`sharp`, que dependen del bump de `next`).

- [ ] **Step 3: Resolver `postcss`/`sharp` subiendo `next`**

Run: `npm audit fix --force`

Expected: el output indica que instala `next@16.3.0` ("outside the stated dependency range" deja de aplicar porque el propio comando actualiza el rango).

- [ ] **Step 4: Confirmar el pin exacto en `package.json`**

Abrir `package.json` y verificar que la línea de `next` en `dependencies` haya quedado:

```json
    "next": "16.3.0",
```

Si `npm audit fix --force` dejó un rango con caret (`^16.3.0`) en vez del pin exacto, editarla a mano a `"16.3.0"` para mantener el mismo estilo de pin que tenía antes (`"16.2.12"`, sin caret).

- [ ] **Step 5: Confirmar 0 vulnerabilidades high/critical**

Run: `npm audit`

Expected: `found 0 vulnerabilities` (o, como máximo, únicamente vulnerabilidades `low`/`moderate` — cero `high`/`critical`).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
Resuelve 5 vulnerabilidades npm high (next, js-yaml, nanoid)

npm audit fix + npm audit fix --force. Sube next de 16.2.12 a
16.3.0, lo que arrastra el fix de postcss y sharp; js-yaml y nanoid
eran transitivos de eslint/vite y salieron con el fix normal.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Verificación final end-to-end

**Depende de:** Tasks 1, 2 y 3 completados.

**Files:** Ninguno modificado — solo verificación.

**Interfaces:** Ninguna.

- [ ] **Step 1: TypeScript**

Run: `npx tsc --noEmit`

Expected: sin salida (0 errores).

- [ ] **Step 2: Lint**

Run: `npm run lint`

Expected: sin errores reportados por ESLint.

- [ ] **Step 3: Tests unitarios**

Run: `npm test`

Expected: todos los tests pasan (sin el error de rolldown de antes).

- [ ] **Step 4: Build de la tienda (dist genérico)**

Run: `npm run build`

Expected: `✓ Compiled successfully`, genera 514 rutas estáticas igual que en el baseline pre-cambios.

- [ ] **Step 5: Build específico de Hostinger (tienda + admin)**

```bash
NEXT_PUBLIC_STORE_DOMAIN=www.litoralmaq.com NEXT_PUBLIC_ADMIN_DOMAIN=admin.litoralmaq.com NEXT_PUBLIC_PERSISTENCE_PROVIDER=local npm run build:hostinger
NEXT_PUBLIC_STORE_DOMAIN=www.litoralmaq.com NEXT_PUBLIC_ADMIN_DOMAIN=admin.litoralmaq.com NEXT_PUBLIC_PERSISTENCE_PROVIDER=local npm run build:admin
```

Expected: ambos comandos terminan sin error y generan `hostinger-ready/` y `admin-ready/`.

- [ ] **Step 6: Validar separación de artefactos**

Run: `npm run validate:separation`

Expected: `26/26 validaciones OK` (mismo resultado que documentaba `REPORTE_ETAPA_7.md` antes de este plan).

- [ ] **Step 7: Confirmar que no queda ninguna credencial real en el repo**

Run: `grep -rn "renderctes@gmail.com\|LitoralMaq2026!" --include="*.md" --include="*.ts" --include="*.tsx" --include="*.mjs" .`

Expected: sin coincidencias (excluye `node_modules`, `.git`, `hostinger-ready`, `admin-ready`, `dist` por no estar en esas extensiones/paths trackeados).

- [ ] **Step 8: Limpiar artefactos de build generados durante la verificación**

```bash
rm -rf dist hostinger-ready admin-ready .next
```

Expected: directorio de trabajo queda limpio (`git status` no muestra estos directorios porque ya están en `.gitignore`).

- [ ] **Step 9: `git status` final**

Run: `git status`

Expected: `nothing to commit, working tree clean` (todos los commits de los tasks anteriores ya están hechos).

---

## Notas de riesgo

- El bump de `next` 16.2.12 → 16.3.0 es menor, pero Task 4 es exactamente la red de seguridad para detectar cualquier regresión antes de dar el plan por terminado.
- Task 2 es la única parte de este plan que toca el estado global de la máquina del usuario (instala/desinstala paquetes de Node vía winget) — no ejecutar sin que el usuario esté presente y de acuerdo en cada paso destructivo (Step 6: desinstalar el Node actual).
