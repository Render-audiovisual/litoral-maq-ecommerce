"use client";

import productsSeed from "@/data/products.json";
import { guestIdFromEmail, isSessionExpired, isValidAdminSession, normalizeEmail } from "@/lib/auth";
import { mergeCartLines } from "@/lib/cart";
import type {
  AuditEntry,
  CartLine,
  Customer,
  Order,
  Product,
  Session,
} from "@/lib/types";
import { getPersistenceAdapter, type PersistenceAdapter } from "@/services/persistence";
import { getAuthAdapter, supportsGuestSessions, supportsSessionRestore } from "@/services/auth";
import { resolveRequestedProvider } from "@/services/provider";
import {
  createAndreaniShipment as requestAndreaniShipment,
  fetchAndreaniLabelUrl as requestAndreaniLabelUrl,
} from "@/services/shipping/andreani-admin-client";
import {
  appendAuditEntry,
  applyDeleteProduct,
  applyReplaceProducts,
  applySaveProduct,
  applyUpdateOrderStatus,
} from "./admin-actions";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Store = {
  ready: boolean;
  products: Product[];
  cart: CartLine[];
  orders: Order[];
  customers: Customer[];
  customerSession: Session | null;
  adminSession: Session | null;
  cartCount: number;
  cartSubtotal: number;
  addToCart: (productId: string, quantity?: number) => void;
  setCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  setCustomerSession: (session: Session | null) => Promise<void>;
  setAdminSession: (session: Session | null) => Promise<void>;
  signOutCustomer: () => Promise<void>;
  signOutAdmin: () => Promise<void>;
  saveProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  replaceProducts: (products: Product[]) => Promise<Product[]>;
  createOrder: (order: Order) => Promise<Order>;
  updateOrderStatus: (id: string, status: Order["status"]) => Promise<Order>;
  createAndreaniShipment: (id: string) => Promise<Order>;
  /** Devuelve una URL de etiqueta recién resuelta contra Andreani. No se
   * guarda en el estado: es una referencia temporal con datos personales. */
  fetchAndreaniLabelUrl: (id: string) => Promise<string>;
  addCustomer: (customer: Customer) => void;
  convertGuestToAccount: (email: string, accountId: string) => void;
  auditLog: AuditEntry[];
};

const StoreContext = createContext<Store | null>(null);

// Claves que siguen siendo responsabilidad directa del store (no del
// PersistenceAdapter): sesiones (dominio de AuthAdapter) y la migración
// heredada v1→v2, que es un ajuste local único, previo a Etapa 5.
const keys = {
  customers: "litoral-customers-v1",
  orders: "litoral-orders-v1",
  customerSession: "litoral-customer-session-v1",
  adminSession: "litoral-admin-session-v1",
  guestCart: "litoral-guest-cart-v1",
  migrationLog: "litoral-migration-log-v1",
};
const STORAGE_VERSION_KEY = "litoral-storage-version";
const STORAGE_VERSION = 2;
const ORDER_REFRESH_INTERVAL_MS = 15_000;

function read<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * "Null object" para el caso de configuración inválida de Supabase: cada
 * método lanza el mismo error claro. Evita esparcir chequeos de `adapter
 * === null` por todo el componente — como los hijos nunca se montan cuando
 * hay `configError` (ver el render de StoreProvider), estos métodos nunca
 * llegan a invocarse realmente; el tipo se mantiene no-nulo en todo el resto
 * del archivo a propósito.
 */
function createFailingAdapter(message: string): PersistenceAdapter {
  const fail = (): never => {
    throw new Error(message);
  };
  return {
    listProducts: fail,
    upsertProduct: fail,
    deleteProduct: fail,
    replaceCatalog: fail,
    listCustomers: fail,
    upsertCustomer: fail,
    listOrders: fail,
    createOrder: fail,
    updateOrderStatus: fail,
    reassignOrdersCustomer: fail,
    loadCart: fail,
    saveCart: fail,
    listAuditLog: fail,
    appendAuditEntry: fail,
  };
}

/**
 * Migración local única (v1 → v2): normaliza emails de clientes y pedidos,
 * deduplica clientes por email normalizado y re-vincula pedidos a la cuenta
 * correcta cuando la coincidencia es inequívoca. No borra carrito, productos,
 * stock ni pedidos; si hay ambigüedad, conserva el dato y lo reporta.
 * Sigue operando directo sobre localStorage a propósito: es anterior y
 * específica del adaptador local, no del modelo compartido con Supabase.
 */
function migrateLegacyDataIfNeeded() {
  const currentVersion = Number(localStorage.getItem(STORAGE_VERSION_KEY) || "1");
  if (currentVersion >= STORAGE_VERSION) return;

  const report: string[] = [];
  try {
    const customers = read<Customer[]>(keys.customers, []);
    const orders = read<Order[]>(keys.orders, []);

    const dedupedCustomers: Customer[] = [];
    const byEmail = new Map<string, Customer>();
    for (const customer of customers) {
      if (customer.role !== "customer") continue;
      const email = normalizeEmail(customer.email);
      const existing = byEmail.get(email);
      if (!existing) {
        const normalized = { ...customer, email };
        byEmail.set(email, normalized);
        dedupedCustomers.push(normalized);
      } else {
        report.push(
          `Cliente duplicado para ${email} (id previo ${existing.id} vs ${customer.id}); se conservó ${existing.id} y se descartó el registro duplicado.`,
        );
        if (!existing.phone && customer.phone) existing.phone = customer.phone;
      }
    }

    const stableIdByEmail = new Map(dedupedCustomers.map((customer) => [customer.email, customer.id]));
    const migratedOrders = orders.map((order) => {
      const email = normalizeEmail(order.email);
      const stableId = stableIdByEmail.get(email);
      if (stableId && order.customerId !== stableId) {
        report.push(`Pedido ${order.id} vinculado de ${order.customerId} a ${stableId} por coincidencia de email.`);
        return { ...order, customerId: stableId, email };
      }
      if (order.email !== email) return { ...order, email };
      return order;
    });

    localStorage.setItem(keys.customers, JSON.stringify(dedupedCustomers));
    localStorage.setItem(keys.orders, JSON.stringify(migratedOrders));
    if (report.length) {
      localStorage.setItem(keys.migrationLog, JSON.stringify(report));
      console.info("[litoral migración v1→v2]", report.join("\n"));
    }
  } catch (error) {
    console.warn("No se pudo completar la migración de datos heredados.", error);
  } finally {
    localStorage.setItem(STORAGE_VERSION_KEY, String(STORAGE_VERSION));
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // Config inválida con NEXT_PUBLIC_PERSISTENCE_PROVIDER=supabase: falla de
  // forma visible (ver services/persistence/index.ts) en vez de caer en
  // silencio a Local, que generaría datos divergentes entre dispositivos.
  const { adapter, configError } = useMemo(() => {
    try {
      return { adapter: getPersistenceAdapter(), configError: null as string | null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { adapter: createFailingAdapter(message), configError: message };
    }
  }, []);
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState<Product[]>(productsSeed as Product[]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSession, setCustomerSessionState] = useState<Session | null>(null);
  const [adminSession, setAdminSessionState] = useState<Session | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  useEffect(() => {
    if (configError) return;
    const timer = window.setTimeout(async () => {
      migrateLegacyDataIfNeeded();
      const loadedCustomerSession = read<Session | null>(keys.customerSession, null);
      const loadedAdminSession = read<Session | null>(keys.adminSession, null);

      // Con Supabase, la caché local (`expiresAt` capturado en el último
      // login) puede quedar desactualizada frente al access_token real, que
      // el SDK ya refrescó solo. `restoreSession()` pregunta la verdad
      // actual en vez de confiar ciegamente en la caché. Limitación conocida
      // (documentada en supabase/README.md): el SDK sostiene UNA sola
      // sesión activa por cliente — con Supabase, sesión de cliente y de
      // admin no pueden coexistir en el mismo navegador como sí ocurre con
      // el adaptador local; la que no coincide con la sesión viva se limpia.
      const authAdapter = getAuthAdapter();
      let restoredCustomer: Session | null = null;
      let restoredAdmin: Session | null = null;
      if (supportsSessionRestore(authAdapter)) {
        const restored = await authAdapter.restoreSession();
        restoredCustomer = restored?.user.role === "customer" ? restored : null;
        restoredAdmin = restored?.user.role === "admin" ? restored : null;
      } else {
        restoredCustomer = isSessionExpired(loadedCustomerSession) ? null : loadedCustomerSession;
        restoredAdmin = isSessionExpired(loadedAdminSession) ? null : loadedAdminSession;
      }

      // Todas las consultas protegidas ocurren DESPUÉS de restaurar la
      // sesión. Así Supabase aplica RLS con el usuario correcto desde la
      // primera carga, sin necesitar F5 para ver pedidos o carrito.
      const [loadedProducts, remoteCart, loadedOrders, loadedCustomers, loadedAuditLog] = await Promise.all([
        adapter.listProducts(),
        adapter.loadCart(restoredCustomer?.user.id),
        adapter.listOrders(),
        adapter.listCustomers(),
        adapter.listAuditLog(),
      ]);
      const guestCart = read<CartLine[]>(keys.guestCart, []);
      const loadedCart = mergeCartLines(guestCart, remoteCart);
      if (restoredCustomer && guestCart.length) {
        await adapter.saveCart(loadedCart, restoredCustomer.user.id);
        localStorage.removeItem(keys.guestCart);
      }
      setProducts(loadedProducts);
      setCart(loadedCart);
      setOrders(loadedOrders);
      setCustomers(loadedCustomers);
      setAuditLog(loadedAuditLog);
      setCustomerSessionState(restoredCustomer);
      setAdminSessionState(restoredAdmin);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [adapter, configError]);

  useEffect(() => {
    if (!ready) return;
    if (customerSession) {
      void adapter.saveCart(cart, customerSession.user.id);
      localStorage.removeItem(keys.guestCart);
    } else {
      localStorage.setItem(keys.guestCart, JSON.stringify(cart));
      void adapter.saveCart(cart);
    }
  }, [cart, ready, adapter, customerSession]);
  useEffect(() => {
    if (!ready) return;
    if (customerSession) localStorage.setItem(keys.customerSession, JSON.stringify(customerSession));
    else localStorage.removeItem(keys.customerSession);
  }, [customerSession, ready]);
  useEffect(() => {
    if (!ready) return;
    if (adminSession) localStorage.setItem(keys.adminSession, JSON.stringify(adminSession));
    else localStorage.removeItem(keys.adminSession);
  }, [adminSession, ready]);

  // Notificaciones operativas sin proveedor externo: mientras hay una
  // sesión activa, actualiza los pedidos cada 15 s y también al volver a la
  // pestaña. Así los contadores del panel y los estados del cliente cambian
  // sin exigir F5. Supabase sigue aplicando RLS en cada lectura.
  useEffect(() => {
    if (!ready || (!adminSession && !customerSession)) return;
    let stopped = false;
    const refreshOrders = async () => {
      try {
        const latest = await adapter.listOrders();
        if (!stopped) setOrders(latest);
      } catch (error) {
        console.warn("No se pudieron actualizar las notificaciones de pedidos.", error);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshOrders();
    };
    const timer = window.setInterval(() => void refreshOrders(), ORDER_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [ready, adapter, adminSession, customerSession]);

  const addToCart = useCallback((productId: string, quantity = 1) => {
    setCart((current) => {
      const existing = current.find((line) => line.productId === productId);
      if (existing) {
        return current.map((line) =>
          line.productId === productId
            ? { ...line, quantity: line.quantity + quantity }
            : line,
        );
      }
      return [...current, { productId, quantity }];
    });
  }, []);

  const setCartQuantity = useCallback((productId: string, quantity: number) => {
    setCart((current) =>
      quantity <= 0
        ? current.filter((line) => line.productId !== productId)
        : current.map((line) =>
            line.productId === productId ? { ...line, quantity } : line,
          ),
    );
  }, []);

  const setCustomerSession = useCallback(async (value: Session | null) => {
    if (!value) {
      setCustomerSessionState(null);
      setOrders([]);
      setCart(read<CartLine[]>(keys.guestCart, []));
      return;
    }
    const [remoteCart, ownOrders] = await Promise.all([
      adapter.loadCart(value.user.id),
      adapter.listOrders(),
    ]);
    const mergedCart = mergeCartLines(cart, remoteCart);
    await adapter.saveCart(mergedCart, value.user.id);
    localStorage.removeItem(keys.guestCart);
    setCart(mergedCart);
    setOrders(ownOrders);
    setAdminSessionState(null);
    setCustomerSessionState(value);
  }, [adapter, cart]);

  const setAdminSession = useCallback(async (value: Session | null) => {
    if (!value) {
      setAdminSessionState(null);
      return;
    }
    const [loadedProducts, loadedOrders, loadedCustomers, loadedAuditLog] = await Promise.all([
      adapter.listProducts(), adapter.listOrders(), adapter.listCustomers(), adapter.listAuditLog(),
    ]);
    setProducts(loadedProducts);
    setOrders(loadedOrders);
    setCustomers(loadedCustomers);
    setAuditLog(loadedAuditLog);
    setCustomerSessionState(null);
    setAdminSessionState(value);
  }, [adapter]);

  const signOutCustomer = useCallback(async () => {
    if (customerSession) await adapter.saveCart(cart, customerSession.user.id);
    await getAuthAdapter().signOut();
    localStorage.removeItem(keys.customerSession);
    setCustomerSessionState(null);
    setAdminSessionState(null);
    setOrders([]);
    setCustomers([]);
    setAuditLog([]);
    setCart(read<CartLine[]>(keys.guestCart, []));
  }, [adapter, cart, customerSession]);

  const signOutAdmin = useCallback(async () => {
    await getAuthAdapter().signOut();
    localStorage.removeItem(keys.adminSession);
    setAdminSessionState(null);
    setCustomerSessionState(null);
    setOrders([]);
    setCustomers([]);
    setAuditLog([]);
  }, []);

  const saveProduct = useCallback(
    (product: Product) => {
      const result = applySaveProduct(products, adminSession, product);
      if (!result.applied || !result.auditEntry) {
        console.warn("Intento de guardar un producto sin sesión de administrador válida.");
        return;
      }
      setProducts(result.next);
      setAuditLog((current) => appendAuditEntry(current, result.auditEntry as AuditEntry));
      void adapter.upsertProduct(product);
      void adapter.appendAuditEntry(result.auditEntry);
    },
    [products, adminSession, adapter],
  );

  const deleteProduct = useCallback(
    (id: string) => {
      const result = applyDeleteProduct(products, adminSession, id);
      if (!result.applied || !result.auditEntry) {
        console.warn("Intento de eliminar un producto sin sesión de administrador válida.");
        return;
      }
      setProducts(result.next);
      setAuditLog((current) => appendAuditEntry(current, result.auditEntry as AuditEntry));
      void adapter.deleteProduct(id);
      void adapter.appendAuditEntry(result.auditEntry);
    },
    [products, adminSession, adapter],
  );

  const replaceProducts = useCallback(
    async (next: Product[]) => {
      const result = applyReplaceProducts(products, adminSession, next);
      if (!result.applied || !result.auditEntry) {
        throw new Error("La sesión de administrador venció. Volvé a ingresar antes de sincronizar.");
      }
      const persisted = await adapter.replaceCatalog(result.next);
      setProducts(persisted);
      setAuditLog((current) => appendAuditEntry(current, result.auditEntry as AuditEntry));
      try {
        await adapter.appendAuditEntry(result.auditEntry);
      } catch (error) {
        console.warn("El catálogo se sincronizó, pero no se pudo guardar la auditoría.", error);
      }
      return persisted;
    },
    [products, adminSession, adapter],
  );

  const createOrder = useCallback(
    async (order: Order) => {
      const persisted = await adapter.createOrder(order);
      setOrders((current) => [persisted, ...current.filter((item) => item.id !== persisted.id)]);
      return persisted;
    },
    [adapter],
  );

  // Server-side real: llama a supabase/functions/andreani-shipment, que
  // valida el rol y hace todo el trabajo (incluida la escritura en orders
  // con SUPABASE_SERVICE_ROLE_KEY) — acá solo se refleja el resultado en el
  // estado local. Idempotente: si el pedido ya tiene envío, la función
  // devuelve el existente en vez de crear uno nuevo (ver punto 7 del pedido).
  const createAndreaniShipment = useCallback(
    async (id: string) => {
      if (!isValidAdminSession(adminSession)) {
        throw new Error("La sesión de administrador venció. Volvé a ingresar.");
      }
      if (resolveRequestedProvider() !== "supabase") {
        throw new Error("El envío por Andreani solo está disponible con el proveedor Supabase activo.");
      }
      const fields = await requestAndreaniShipment(id, adminSession);
      let next: Order | undefined;
      setOrders((current) =>
        current.map((order) => {
          if (order.id !== id) return order;
          next = { ...order, ...fields };
          return next;
        }),
      );
      if (!next) throw new Error("El pedido no está cargado en el panel.");
      return next;
    },
    [adminSession],
  );

  const fetchAndreaniLabelUrl = useCallback(
    async (id: string) => {
      if (!isValidAdminSession(adminSession)) {
        throw new Error("La sesión de administrador venció. Volvé a ingresar.");
      }
      return await requestAndreaniLabelUrl(id, adminSession);
    },
    [adminSession],
  );

  const updateOrderStatus = useCallback(
    async (id: string, status: Order["status"]) => {
      const result = applyUpdateOrderStatus(orders, adminSession, id, status);
      if (!result.applied || !result.auditEntry) {
        throw new Error("La sesión de administrador venció. Volvé a ingresar.");
      }
      const persisted = await adapter.updateOrderStatus(id, status);
      if (!persisted) throw new Error("Supabase no confirmó el cambio de estado.");
      setOrders((current) => current.map((order) => order.id === id ? persisted : order));
      setAuditLog((current) => appendAuditEntry(current, result.auditEntry as AuditEntry));
      try {
        await adapter.appendAuditEntry(result.auditEntry);
      } catch (error) {
        console.warn("El estado cambió, pero no se pudo guardar la auditoría.", error);
      }
      // A propósito NO se dispara acá la creación del envío Andreani. El
      // pedido en "preparando" solo HABILITA la acción — el envío real se
      // genera únicamente cuando el admin confirma explícitamente "Crear
      // envío Andreani" en el panel, con resumen previo de destinatario,
      // destino, bultos y costo (ver admin/pedidos/page.tsx). Un cambio de
      // estado nunca debe disparar un envío real en silencio.
      return persisted;
    },
    [orders, adminSession, adapter],
  );

  const addCustomer = useCallback(
    (customer: Customer) => {
      if (customer.role !== "customer") return;
      const email = normalizeEmail(customer.email);
      setCustomers((current) => {
        const index = current.findIndex((item) => normalizeEmail(item.email) === email);
        if (index === -1) return [{ ...customer, email }, ...current];
        const next = [...current];
        next[index] = { ...next[index], ...customer, email };
        return next;
      });
      void adapter.upsertCustomer({ ...customer, email });
    },
    [adapter],
  );

  const convertGuestToAccount = useCallback(
    (email: string, accountId: string) => {
      // Con identidad real (Supabase: la conversión conserva el mismo
      // auth.uid() del invitado, ver supabase/README.md §4.3) no hay nada
      // que reasignar — los pedidos ya quedaron creados con ese uid. Además
      // reasignar acá rompería contra Supabase: guestIdFromEmail() no es un
      // uuid válido y orders.customer_id sí lo es. Este flujo es exclusivo
      // del modelo local, donde el invitado es el id determinístico
      // `guest-<email>` sin identidad real detrás.
      if (supportsGuestSessions(getAuthAdapter())) return;
      const guestId = guestIdFromEmail(email);
      if (guestId === accountId) return;
      setOrders((current) =>
        current.map((order) => (order.customerId === guestId ? { ...order, customerId: accountId } : order)),
      );
      void adapter.reassignOrdersCustomer(guestId, accountId);
    },
    [adapter],
  );

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartSubtotal = cart.reduce((sum, line) => {
    const product = products.find((item) => item.id === line.productId);
    return sum + (product?.price || 0) * line.quantity;
  }, 0);

  const value = useMemo(
    () => ({
      ready,
      products,
      cart,
      orders,
      customers,
      customerSession,
      adminSession,
      cartCount,
      cartSubtotal,
      addToCart,
      setCartQuantity,
      clearCart: () => setCart([]),
      setCustomerSession,
      setAdminSession,
      signOutCustomer,
      signOutAdmin,
      saveProduct,
      deleteProduct,
      replaceProducts,
      createOrder,
      updateOrderStatus,
      createAndreaniShipment,
      fetchAndreaniLabelUrl,
      addCustomer,
      convertGuestToAccount,
      auditLog,
    }),
    [
      ready,
      products,
      cart,
      orders,
      customers,
      customerSession,
      adminSession,
      cartCount,
      cartSubtotal,
      addToCart,
      setCartQuantity,
      setCustomerSession,
      setAdminSession,
      signOutCustomer,
      signOutAdmin,
      saveProduct,
      deleteProduct,
      replaceProducts,
      createOrder,
      updateOrderStatus,
      createAndreaniShipment,
      fetchAndreaniLabelUrl,
      addCustomer,
      convertGuestToAccount,
      auditLog,
    ],
  );

  if (configError) {
    return (
      <main className="center-state" aria-live="assertive">
        <span className="state-icon">⚠</span>
        <h1>Error de configuración</h1>
        <p>{configError}</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="center-state" aria-live="polite">
        <div className="spinner" />
        <p>Cargando Litoral Maq…</p>
      </main>
    );
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore requiere StoreProvider.");
  return context;
}
