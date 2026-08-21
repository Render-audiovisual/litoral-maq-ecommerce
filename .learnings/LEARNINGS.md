# Learnings

## 2026-08-11 — Verificar integraciones reales antes de declararlas operativas

El panel mostraba una sincronización exitosa, pero usaba un adaptador demo y un catálogo empaquetado. Antes de considerar una integración lista, comprobar el fetch contra la fuente externa, la persistencia después de recargar y el comportamiento compartido entre dispositivos.

## 2026-08-19 — Comparar modelos de producto con límites alfanuméricos

Buscar un SKU con `includes` incorporó por error `PA20C1` al seleccionar `A20C1`. Para selecciones comerciales por modelo, exigir que el identificador esté delimitado por caracteres no alfanuméricos y probar el resultado contra el catálogo real.

## 2026-08-21 — Separar composición de referencia e identidad visual

Una referencia de ecommerce puede aprobarse solo por su estructura (producto + precio) sin aprobar su fondo, color ni tono. En Litoral, conservar siempre la paleta clara azul, naranja y celeste salvo pedido explícito de cambio.
