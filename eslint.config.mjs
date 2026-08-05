import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "dist/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefactos de build generados (Etapa 6 — despliegue separado). Son
    // JS minificado de Next.js, no código fuente: lintearlos no aporta
    // nada y generaba ~1950 falsos positivos que tapaban los hallazgos
    // reales en src/. hostinger-ready/ ya se ignoraba de forma incompleta
    // (no estaba listado; solo dist/ lo estaba) — admin-ready/ es nuevo.
    "hostinger-ready/**",
    "admin-ready/**",
  ]),
]);

export default eslintConfig;
