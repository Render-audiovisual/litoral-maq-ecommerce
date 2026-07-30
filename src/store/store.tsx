"use client";

import productsSeed from "@/data/products.json";
import type {
  CartLine,
  Customer,
  Order,
  Product,
  Session,
} from "@/lib/types";
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
  session: Session | null;
  cartCount: number;
  cartSubtotal: number;
  addToCart: (productId: string, quantity?: number) => void;
  setCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  setSession: (session: Session | null) => void;
  saveProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  replaceProducts: (products: Product[]) => void;
  createOrder: (order: Order) => void;
  updateOrderStatus: (id: string, status: Order["status"]) => void;
  addCustomer: (customer: Customer) => void;
};

const StoreContext = createContext<Store | null>(null);
const keys = {
  products: "litoral-products-v1",
  cart: "litoral-cart-v1",
  orders: "litoral-orders-v1",
  customers: "litoral-customers-v1",
  session: "litoral-session-v1",
};

function read<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState<Product[]>(productsSeed as Product[]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [session, setSessionState] = useState<Session | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProducts(read(keys.products, productsSeed as Product[]));
      setCart(read(keys.cart, []));
      setOrders(read(keys.orders, []));
      setCustomers(read(keys.customers, []));
      setSessionState(read(keys.session, null));
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(keys.products, JSON.stringify(products));
  }, [products, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem(keys.cart, JSON.stringify(cart));
  }, [cart, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem(keys.orders, JSON.stringify(orders));
  }, [orders, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem(keys.customers, JSON.stringify(customers));
  }, [customers, ready]);
  useEffect(() => {
    if (ready) {
      if (session) localStorage.setItem(keys.session, JSON.stringify(session));
      else localStorage.removeItem(keys.session);
    }
  }, [session, ready]);

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

  const setSession = useCallback((value: Session | null) => {
    setSessionState(value);
  }, []);

  const saveProduct = useCallback((product: Product) => {
    setProducts((current) => {
      const exists = current.some((item) => item.id === product.id);
      return exists
        ? current.map((item) => (item.id === product.id ? product : item))
        : [product, ...current];
    });
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setProducts((current) => current.filter((product) => product.id !== id));
  }, []);

  const createOrder = useCallback((order: Order) => {
    setOrders((current) => [order, ...current]);
  }, []);

  const updateOrderStatus = useCallback(
    (id: string, status: Order["status"]) => {
      setOrders((current) =>
        current.map((order) => (order.id === id ? { ...order, status } : order)),
      );
    },
    [],
  );

  const addCustomer = useCallback((customer: Customer) => {
    setCustomers((current) =>
      current.some((item) => item.email === customer.email)
        ? current
        : [customer, ...current],
    );
  }, []);

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
      session,
      cartCount,
      cartSubtotal,
      addToCart,
      setCartQuantity,
      clearCart: () => setCart([]),
      setSession,
      saveProduct,
      deleteProduct,
      replaceProducts: setProducts,
      createOrder,
      updateOrderStatus,
      addCustomer,
    }),
    [
      ready,
      products,
      cart,
      orders,
      customers,
      session,
      cartCount,
      cartSubtotal,
      addToCart,
      setCartQuantity,
      setSession,
      saveProduct,
      deleteProduct,
      createOrder,
      updateOrderStatus,
      addCustomer,
    ],
  );

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
