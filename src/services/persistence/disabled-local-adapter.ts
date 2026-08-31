import type { PersistenceAdapter } from "./types";

/**
 * Reemplazo de compilación para producción. El adaptador real de pruebas
 * continúa disponible en desarrollo, pero no viaja en los artefactos que se
 * publican en Hostinger.
 */
export function createLocalPersistenceAdapter(): PersistenceAdapter {
  throw new Error(
    "El adaptador local de persistencia no está incluido en este artefacto de producción.",
  );
}
