import { defineConfig, devices } from '@playwright/test';

/**
 * Los E2E crean cuentas y pedidos de verdad. Con `NEXT_PUBLIC_PERSISTENCE_PROVIDER=supabase`
 * en `.env.local` — que es la configuración habitual de desarrollo — `npm run dev`
 * apunta al proyecto Supabase REAL, así que una corrida de Playwright escribiría
 * en la base de producción. Ya pasó: hay pedidos de prueba en la base productiva.
 *
 * Por defecto, entonces, el servidor de pruebas se levanta SIEMPRE en modo local.
 * Para correr contra un Supabase de staging hay que pedirlo explícitamente:
 *
 *   E2E_SUPABASE_URL=https://<staging>.supabase.co \
 *   E2E_SUPABASE_PUBLISHABLE_KEY=<key de staging> \
 *   npx playwright test
 *
 * El guard de abajo corta la corrida si esa URL es la misma que la de
 * producción, para que un copy/paste distraído no publique datos de prueba.
 */
const PRODUCTION_SUPABASE_HOSTS = ['bhtaecnzpuotlsenbdlz.supabase.co'];

const stagingUrl = process.env.E2E_SUPABASE_URL?.trim();
const stagingKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY?.trim();

if (stagingUrl) {
  const host = new URL(stagingUrl).hostname;
  if (PRODUCTION_SUPABASE_HOSTS.includes(host)) {
    throw new Error(
      `E2E_SUPABASE_URL apunta al proyecto de producción (${host}). ` +
        'Los E2E crean cuentas y pedidos reales: usá un proyecto de staging separado.',
    );
  }
  if (!stagingKey) {
    throw new Error('E2E_SUPABASE_URL requiere también E2E_SUPABASE_PUBLISHABLE_KEY.');
  }
}

// Sin staging declarado, el modo local es el único seguro. Estas variables
// pisan las de `.env.local` porque Next no sobreescribe lo que ya está en
// process.env.
const serverEnv: Record<string, string> = stagingUrl
  ? {
      NEXT_PUBLIC_PERSISTENCE_PROVIDER: 'supabase',
      NEXT_PUBLIC_SUPABASE_URL: stagingUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: stagingKey as string,
    }
  : { NEXT_PUBLIC_PERSISTENCE_PROVIDER: 'local' };

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: serverEnv,
  },
});
