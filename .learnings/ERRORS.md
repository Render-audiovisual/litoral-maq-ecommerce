# Errors

## 2026-08-11 — El build detectó un type guard demasiado amplio

El primer build del nuevo importador falló porque el predicado de filtrado no era asignable al tipo inferido. Se reemplazó `map + filter` por un `reduce<Product[]>` explícito y se volvió a ejecutar lint, tests y build completos.
