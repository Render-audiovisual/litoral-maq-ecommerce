import { rm } from "node:fs/promises";
import path from "node:path";

const generatedDist = path.join(process.cwd(), "dist");

// `next dev` y `next build` comparten distDir en este proyecto. Limpiar el
// directorio generado antes del build evita empaquetar dist/dev por accidente.
await rm(generatedDist, { recursive: true, force: true });
