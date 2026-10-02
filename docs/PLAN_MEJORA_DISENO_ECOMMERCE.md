# Plan integral de mejora de diseño — Litoral Maq

## 1. Objetivo

Elevar `litoralmaq.com` a una experiencia ecommerce profesional, reconocible y orientada a ventas, preservando íntegramente:

- catálogo, precios, stock e imágenes;
- navegación, búsqueda y filtros;
- carrito, checkout y Mercado Pago;
- cuentas, pedidos y seguimiento;
- Supabase, Google Sheets y demás integraciones;
- panel administrativo, SEO, URLs y contenido legal.

La mejora no consiste en reemplazar el producto existente, sino en fortalecer su presentación, claridad comercial, confianza y facilidad de uso.

## 2. Decisión de posicionamiento provisional

Hasta contar con una definición más específica del cliente, el diseño atenderá a dos públicos:

1. profesionales, talleres y trabajadores que valoran disponibilidad, potencia, precio y rapidez;
2. compradores del hogar que necesitan orientación, seguridad y una compra sencilla.

La expresión de marca será **profesional, robusta y cercana**. El azul seguirá transmitiendo confianza; el naranja se reservará para acciones, precio y energía comercial; los fondos claros darán aire y legibilidad. No se convertirán todas las superficies en tarjetas ni se aplicarán efectos decorativos sin función.

## 3. Principios no negociables

1. **No eliminar información.** Se puede reorganizar, jerarquizar o resumir visualmente, pero no borrar contenido operativo o comercial sin aprobación.
2. **No modificar integraciones durante el rediseño.** Los contratos de datos y las llamadas a Supabase, Mercado Pago, envíos y autenticación quedan fuera del alcance visual.
3. **Cambios pequeños y reversibles.** Cada fase se implementará en una rama separada y podrá revertirse de forma independiente.
4. **Diseñar primero los flujos de compra.** Inicio, catálogo, ficha, carrito y checkout tienen prioridad sobre superficies administrativas.
5. **Móvil primero, escritorio validado.** La versión móvil no será una reducción de escritorio: tendrá decisiones propias de jerarquía, filtros, acciones y densidad.
6. **Accesibilidad real.** Foco visible, contraste AA, controles semánticos, navegación por teclado y una alternativa de movimiento reducido.
7. **Rendimiento como parte del diseño.** Ningún efecto visual justificará retrasar el contenido, bloquear una acción o generar saltos de layout.

## 4. Estado actual y oportunidades detectadas

### Fortalezas que deben conservarse

- Propuesta de valor clara en el inicio: productos reales, precios visibles, envío nacional y retiro local.
- Buscador con sugerencias, navegación por categorías y catálogo filtrable.
- Productos destacados, testimonios reales y ubicación física.
- Estados de stock, carrito, checkout y seguimiento ya integrados.
- Identidad cromática reconocible: azul Litoral, naranja comercial y cian de apoyo.
- Componentes semánticos y varios estados de foco ya implementados.

### Oportunidades prioritarias

- Unificar radios, sombras, espaciado, densidad y jerarquías tipográficas.
- Hacer que el encabezado y el buscador funcionen como herramienta principal de compra.
- Reducir competencia visual entre carruseles continuos, promociones y llamados a la acción.
- Mejorar la comparación rápida de productos: marca, nombre, precio, disponibilidad y beneficio.
- Dar más peso a confianza, medios de pago, retiro, envíos, cambios y atención humana.
- Hacer más explícita la progresión catálogo → producto → carrito → checkout.
- Refinar estados vacíos, carga, error, producto sin imagen y stock pendiente.
- Corregir la política de animación: hoy `prefers-reduced-motion` puede dejar congeladas todas las cintas y hacer que el sitio parezca roto.

## 5. Dirección visual propuesta

### Personalidad

**Taller moderno:** robustez técnica con una ejecución limpia y contemporánea. Debe sentirse confiable y directa, no lujosa ni genérica.

### Sistema visual

- Mantener azul y naranja como colores propietarios.
- Usar el naranja para CTA principal, ofertas, precio y señales de acción; evitar repartirlo sin jerarquía.
- Usar el cian como acento secundario y no como tercer CTA competidor.
- Definir una escala única de espacios basada en 4/8 px.
- Definir radios por función: controles, tarjetas y superficies destacadas.
- Limitar sombras a 3 niveles: reposo, elevación y overlay.
- Usar una jerarquía tipográfica estable para título, sección, producto, precio, apoyo y metadatos.
- Mantener fotografías de producto limpias y testimonios reales como señal de autenticidad.

### Firma visual

La identidad distintiva será la combinación de:

- titulares fuertes y compactos;
- bloques diagonales o líneas técnicas inspiradas en maquinaria;
- grandes fotografías de producto sobre superficies claras;
- etiquetas de información útiles, no decorativas;
- naranja concentrado en los puntos donde se toma una decisión.

## 6. Plan por superficie

### 6.1 Encabezado y navegación — prioridad P0

- Reordenar la jerarquía entre marca, buscador, cuenta y carrito.
- Mantener el buscador visible y dominante en escritorio.
- En móvil, hacer accesible la búsqueda sin tapar navegación ni acciones.
- Mostrar estados activos claros y áreas táctiles de al menos 44 × 44 px.
- Revisar la franja superior para que informe sin competir con la navegación.
- Mantener accesos a cuenta, pedidos y carrito en todo momento.

**Resultado esperado:** cualquier persona entiende dónde buscar, cómo navegar y dónde está su compra en menos de 5 segundos.

### 6.2 Inicio — prioridad P0

- Conservar todos los bloques actuales, pero ordenar su ritmo y protagonismo.
- Simplificar el hero para que propuesta, producto y CTA formen una sola historia.
- Dar un tratamiento consistente a promociones y categorías.
- Añadir una franja de confianza reutilizable con pago seguro, retiro, envío y atención.
- Presentar productos estrella con tarjetas comparables y CTA inequívoco.
- Reforzar testimonios con contexto, nombre o ubicación cuando exista información confiable.
- Mejorar el cierre comercial antes del footer.

**Resultado esperado:** el inicio responde qué venden, por qué confiar, cómo recibir y qué comprar.

### 6.3 Catálogo — prioridad P0

- Mantener búsqueda, categorías, marca, precio, disponibilidad y ordenamiento.
- Sincronizar filtros con la URL para que una selección pueda compartirse o recuperarse.
- Convertir filtros móviles en un panel claro con cantidad de resultados y acciones aplicar/limpiar.
- Mejorar densidad de la grilla según ancho disponible.
- Mostrar filtros activos como chips removibles.
- Hacer que precio, stock y CTA puedan compararse sin releer cada tarjeta.
- Conservar y mejorar el estado sin resultados.

**Resultado esperado:** encontrar un producto requiere menos pasos y comparar alternativas resulta inmediato.

### 6.4 Tarjeta de producto — prioridad P0

- Mantener nombre, marca, código, precio, stock, imagen y acción de carrito.
- Definir una altura y alineación consistentes sin cortar información importante.
- Priorizar precio y disponibilidad antes del CTA.
- Añadir feedback visible al agregar al carrito sin desplazar la grilla.
- Distinguir claramente sin stock, stock pendiente y disponible.
- Preparar espacio controlado para oferta, cuotas o envío cuando esos datos sean reales.

**Resultado esperado:** la tarjeta permite decidir y actuar sin abrir obligatoriamente la ficha.

### 6.5 Ficha de producto — prioridad P0

- Mejorar galería, miniaturas, zoom y orden de información.
- Mantener descripción, especificaciones, código, precio y stock completos.
- Ubicar CTA, cantidad, disponibilidad y entrega dentro de una zona de compra clara.
- Añadir señales de confianza junto al CTA, no sólo en el footer.
- Presentar retiro y envío con lenguaje concreto.
- Mantener productos relacionados y convertirlos en una continuación comercial útil.
- En móvil, considerar una barra de compra inferior sólo si no oculta contenido ni controles.

**Resultado esperado:** resolver dudas esenciales antes de pedir ayuda por WhatsApp.

### 6.6 Carrito — prioridad P0

- Mantener productos, cantidades, subtotal, entrega y acciones actuales.
- Reducir espacio vacío y acercar el resumen al contenido principal.
- Mantener el resumen visible en escritorio y natural en móvil.
- Dar feedback inmediato al actualizar o quitar productos.
- Explicar con claridad qué está incluido y qué se calcula después.
- Reforzar seguridad y continuidad antes de “Iniciar compra”.

**Resultado esperado:** minimizar dudas antes de pasar al checkout.

### 6.7 Checkout — prioridad P0

- Mantener todos los campos, validaciones y opciones de entrega.
- Reforzar la progresión visual de datos → entrega → pago.
- Mostrar errores junto al campo y llevar el foco al primer error.
- Evitar que el usuario pierda datos al corregir o volver atrás.
- Mantener resumen, total y estado de envío siempre comprensibles.
- Comunicar claramente si el pago se realiza ahora o se coordina después.
- No rediseñar ni activar Mercado Pago desde esta iniciativa.

**Resultado esperado:** finalizar una compra sin incertidumbre ni pasos sorpresivos.

### 6.8 Acceso, cuenta y seguimiento — prioridad P1

- Mantener la versión centrada y simple del acceso.
- Unificar formularios, mensajes, validaciones y estados de seguridad.
- Priorizar estado actual, siguiente paso y ayuda en cada pedido.
- Diseñar estados vacíos y errores con una acción de recuperación concreta.

### 6.9 Footer — prioridad P1

- Mantener marca, ubicación, horarios, productos, seguimiento, ayuda, legales y redes.
- Mejorar legibilidad y jerarquía sin sumar columnas innecesarias.
- Convertir “Render” en enlace cuando se reciba el destino definitivo.
- Evitar que el botón flotante de WhatsApp tape enlaces o contenido.

### 6.10 Administración — prioridad P2

- No mezclar el rediseño comercial con cambios funcionales del panel.
- Aplicar después el mismo sistema de tipografía, controles, estados y espaciado.
- Probar tablas, formularios y modales con datos largos y estados vacíos.

## 7. Sistema de movimiento

### Problema confirmado

La implementación actual combina animaciones CSS y carruseles controlados por JavaScript. El hook de actividad detiene carruseles cuando `prefers-reduced-motion: reduce` está activo, mientras que la hoja global reduce todas las animaciones y transiciones a `0.01ms`. El resultado visible puede parecer una falla.

### Política propuesta

1. **Movimiento normal:** entradas breves, feedback de interacción y carruseles controlables.
2. **Movimiento reducido:** eliminar desplazamientos largos y bucles automáticos, pero mantener estados finales visibles, feedback instantáneo y controles manuales.
3. **Nunca ocultar información detrás de una animación.** El contenido será visible aunque JavaScript falle.
4. **Animar sólo `transform` y `opacity`.**
5. **Permitir interacción inmediata.** Una animación no bloqueará botones ni gestos.
6. **Pausar movimiento continuo** al pasar el cursor, enfocar, arrastrar, reproducir video, ocultar la pestaña o sacar el bloque del viewport.
7. **Agregar controles explícitos** cuando un movimiento automático dure más de 5 segundos y conviva con contenido relevante.

### Matriz de verificación

| Escenario | Resultado esperado |
|---|---|
| Escritorio, movimiento normal | Entradas y carruseles fluidos a 60 fps cuando el equipo lo permita |
| Móvil, movimiento normal | Gestos verticales y horizontales sin conflicto |
| Movimiento reducido | Sin loops automáticos; contenido completo y controles manuales disponibles |
| Pestaña oculta | Animaciones continuas pausadas |
| Elemento fuera del viewport | Trabajo de animación pausado |
| JavaScript deshabilitado o con error | Contenido principal visible, sin opacidad inicial permanente |

## 8. Implementación segura

### Fase 0 — Línea base

- Capturas de las pantallas actuales en escritorio y móvil.
- Registro de rutas, contenido y flujos protegidos.
- Pruebas del recorrido catálogo → producto → carrito → checkout.
- Medición inicial de Core Web Vitals y accesibilidad.

### Fase 1 — Fundaciones

- Tokens de color, tipografía, espaciado, radios, sombras y movimiento.
- Estados de botones, enlaces, inputs, focus, carga, éxito y error.
- Sin cambios de datos ni comportamiento comercial.

### Fase 2 — Conversión principal

- Encabezado, inicio, catálogo, tarjetas y ficha de producto.
- Revisión comparativa en 360, 390, 768, 1280 y 1440 px.

### Fase 3 — Cierre de compra

- Carrito, checkout y estados de resultado.
- Pruebas funcionales con Mercado Pago desactivado y activado según configuración existente; nunca alterar credenciales.

### Fase 4 — Confianza y retención

- Acceso, cuenta, pedidos, testimonios y footer.
- Revisión de copy comercial sin eliminar información.

### Fase 5 — Administración

- Aplicación controlada del sistema visual al panel, sin tocar lógica.

### Fase 6 — Publicación

- Build y pruebas completas.
- Revisión visual de staging.
- Aprobación.
- Despliegue con manifiesto y procedimiento de rollback existente.
- Verificación posterior en producción.

## 9. Estrategia de ramas y revisiones

- Crear una rama `codex/design-system-litoral` desde el `main` actualizado.
- No trabajar directamente en `main`.
- Separar commits por superficie o sistema, evitando mezclar estilos con cambios de datos.
- Publicar primero en staging o preview.
- Requerir revisión visual antes de fusionar.
- Mantener el despliegue productivo anterior disponible para rollback.

## 10. Puertas de calidad

Ninguna fase se considera terminada si no cumple:

### Funcionalidad

- catálogo, búsqueda y filtros conservan resultados;
- agregar, quitar y modificar cantidades funciona;
- carrito persiste según el comportamiento vigente;
- checkout conserva datos, validaciones y opciones de entrega;
- autenticación, pedidos, Supabase y Mercado Pago no presentan regresiones;
- panel administrativo mantiene sus operaciones.

### Visual

- sin desbordes horizontales involuntarios;
- sin texto cortado, solapado o debajo de controles flotantes;
- jerarquía clara a 360, 390, 768, 1280 y 1440 px;
- estados hover, active, focus, disabled, loading, error y success definidos;
- comparación antes/después aprobada.

### Accesibilidad

- contraste WCAG AA;
- navegación por teclado completa;
- foco visible y no cubierto por elementos sticky;
- controles con nombre accesible;
- zoom del navegador permitido;
- variante funcional para movimiento reducido.

### Rendimiento

- objetivo LCP menor a 2,5 s;
- objetivo CLS menor a 0,1;
- objetivo INP menor a 200 ms;
- sin animaciones de propiedades que provoquen layout continuo;
- imágenes críticas priorizadas y resto cargado de forma diferida;
- sin aumento injustificado del JavaScript inicial.

### Ingeniería

- TypeScript, lint, pruebas unitarias y E2E en verde;
- build de Hostinger correcto;
- diff revisado para confirmar que no se modificaron datos, secretos ni integraciones;
- repositorio limpio y commit identificable.

## 11. Métricas comerciales sugeridas

La mejora visual se evaluará también por comportamiento, no sólo por opinión:

- uso del buscador y porcentaje de búsquedas con resultado;
- clic desde inicio hacia catálogo o ficha;
- tasa de producto visto → agregado al carrito;
- tasa de carrito → checkout iniciado;
- tasa de checkout iniciado → pedido creado;
- abandono por paso del checkout;
- uso de WhatsApp antes y después de mejorar la información;
- conversión móvil frente a escritorio.

La instrumentación analítica deberá ser una tarea separada y respetar la política de privacidad.

## 12. Orden recomendado

| Orden | Entrega | Impacto | Riesgo |
|---|---|---:|---:|
| 1 | Línea base, capturas y pruebas protegidas | Alto | Bajo |
| 2 | Sistema visual y movimiento | Alto | Medio |
| 3 | Header, inicio y búsqueda | Alto | Medio |
| 4 | Catálogo y tarjetas | Alto | Medio |
| 5 | Ficha de producto | Muy alto | Medio |
| 6 | Carrito y checkout | Muy alto | Alto |
| 7 | Cuenta, seguimiento y footer | Medio | Bajo |
| 8 | Panel administrativo | Medio | Medio |
| 9 | Métricas y optimización posterior | Alto | Bajo |

## 13. Definición de terminado

El rediseño estará terminado cuando:

1. toda la información y funcionalidad preexistente continúe disponible;
2. los recorridos críticos estén verificados en móvil y escritorio;
3. el sistema visual sea consistente en todas las superficies públicas;
4. las animaciones funcionen en modo normal y tengan una alternativa correcta en movimiento reducido;
5. las puertas de calidad funcionales, visuales, accesibles, de rendimiento e ingeniería estén aprobadas;
6. el cliente apruebe la comparación visual en staging;
7. producción se verifique después del despliegue y exista un rollback probado.

