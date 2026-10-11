# Etiquetas Más vendido

- Tienda: `/mas-vendidos` muestra todos los productos activos etiquetados, sin filtros y sin límite de precio.
- Dueño: `/admin/mas-vendidos` y la casilla «Etiqueta Más vendido» al editar un producto.
- Equipo/Gabriel: `/etiquetas` en la tienda, con su cuenta existente. El servidor admite únicamente roles admin y employee; no cambia usuarios ni roles.
- La función `product-bestseller-label` acepta exclusivamente id, etiqueta booleana y versión del producto. No modifica precio, stock, visibilidad ni permisos. Usa control de concurrencia.
- La columna nullable `best_seller` conserva la selección histórica para productos aún no editados. true incorpora y false excluye explícitamente. «Destacado» sigue siendo otra opción independiente.
- La sincronización del Sheet no actualiza esta columna.
- Vista local: los cambios de la pantalla de etiquetas son una simulación sin escrituras en Supabase.
- Falta comprobar el guardado con una sesión real autorizada después del despliegue. No crear usuarios ni pedidos de prueba en producción.
