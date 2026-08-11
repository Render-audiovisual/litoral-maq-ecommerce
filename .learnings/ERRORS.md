# Errors

## 2026-08-11 — El build detectó un type guard demasiado amplio

El primer build del nuevo importador falló porque el predicado de filtrado no era asignable al tipo inferido. Se reemplazó `map + filter` por un `reduce<Product[]>` explícito y se volvió a ejecutar lint, tests y build completos.

## 2026-08-11 — La prueba remota navegó antes de completar el login

Una prueba contra la preview hizo `goto` inmediatamente después del clic de acceso y se adelantó al enrutamiento asíncrono. Se agregó una espera explícita por la URL `/admin` antes de abrir Productos.
