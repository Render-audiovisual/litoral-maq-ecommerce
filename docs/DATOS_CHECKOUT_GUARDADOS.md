# Datos de checkout guardados

Las cuentas verificadas pueden guardar explícitamente nombre, contacto, DNI y dirección desde el paso de revisión. No se guardan tarjetas ni contraseñas. Los datos se precargan al volver a comprar en cualquier dispositivo con la misma cuenta; los campos editados durante la compra tienen prioridad sobre la carga tardía.

La tabla independiente `customer_checkout_details` no modifica Auth, perfiles ni roles. Tiene RLS y no otorga permisos a `anon` ni `authenticated`. La función `checkout-details`, con JWT, valida la identidad en Auth y siempre usa ese identificador como dueño. Al guardar compara además la cuenta esperada para rechazar cambios de sesión durante la operación. Una falla de esta función no bloquea una compra.

Despliegue mediante el pipeline habitual: migración aditiva, función, sitio. No requiere secretos nuevos. No crear usuarios ni pedidos de prueba en producción. Verificaciones locales: parser/servicio, autorización de la función, migración y permisos en Postgres aislado, checkout móvil/escritorio. La prueba real de sincronización entre dos dispositivos queda pendiente de una cuenta de staging o prueba manual del titular.

En el home, Más vendidos usa desplazamiento nativo manual en pantallas táctiles o hasta 900px. No corre el bucle de animación ni muestra copias duplicadas en ese modo. En escritorio se mantiene el movimiento automático.
