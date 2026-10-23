# Visibilidad automática por stock

Un producto con **3 unidades o menos de stock confirmado** se oculta de la tienda solo. Cuando el stock vuelve a superar 3, se muestra de nuevo, pero únicamente si lo ocultó este automatismo.

- Vive en la base (trigger `products_low_stock_visibility`, migración `20261023160000_low_stock_auto_hide.sql`). Cubre el sync del Sheet, el panel y cualquier SQL.
- La columna `products.auto_hidden` marca los productos ocultados por stock. Un producto que alguien ocultó a mano nunca se reactiva solo.
- Sin stock confirmado (`incomplete` incluye `stock`) no se toca nada.
- Aplica también a los de "Más vendido": si queda con 3 o menos, deja de verse hasta reponer.
- En el panel, el interruptor "Visible" de un producto con stock bajo no se puede activar: avisa por qué. La etiqueta dice "Oculto por stock".
- El umbral está en `LOW_STOCK_HIDE_AT` (SQL y `src/lib/product-availability.ts`). Para cambiarlo, modificar ambos y agregar una migración.

Los pedidos con pago rechazado se cancelan solos a las 24 h (migración `20261023150000_expire_rejected_orders.sql`), igual que los pendientes, pero sin mandar correo al cliente.
