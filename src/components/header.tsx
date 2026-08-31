"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FocusEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useStore } from "@/store/store";
import { isPermanentCustomerSession, isValidCustomerSession } from "@/lib/auth";
import { selectOwnOrders } from "@/lib/orders";
import { isActiveOrder } from "@/lib/order-details";
import { searchProducts } from "@/lib/search";
import { formatCurrency } from "@/lib/utils";
import { availabilityLabel, getProductAvailability } from "@/lib/product-availability";

/** Desde cuántas letras vale la pena sugerir: con una sola, medio catálogo
 * coincide y el cartel no ayuda. */
const MINIMUM_QUERY = 2;
const DESKTOP_SUGGESTIONS = 5;
const MOBILE_SUGGESTIONS = 4;

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { cartCount, customerSession, orders, products } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [mobileSearch, setMobileSearch] = useState(false);
  // Una sesión de invitado (anónima) NO es una cuenta: mostrar su nombre
  // significaba mostrar una cadena vacía al lado del ícono de usuario.
  const account = isPermanentCustomerSession(customerSession) ? customerSession : null;
  const activeOrderCount = isValidCustomerSession(customerSession)
    ? selectOwnOrders(orders, customerSession).filter(isActiveOrder).length
    : 0;

  const catalog = useMemo(() => products.filter((product) => product.active), [products]);
  // ponytail: filtra los ~500 productos ya cargados en memoria en cada tecla.
  // Si el catálogo crece a varios miles, mover a un endpoint con debounce.
  const results = useMemo(
    () => (query.trim().length >= MINIMUM_QUERY ? searchProducts(catalog, query) : []),
    [catalog, query],
  );
  const suggestions = results.slice(0, mobileSearch ? MOBILE_SUGGESTIONS : DESKTOP_SUGGESTIONS);
  const showSuggestions = suggestionsOpen && query.trim().length >= MINIMUM_QUERY;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 560px)");
    const update = () => setMobileSearch(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (pathname.startsWith("/admin")) return null;

  function productHref(slug: string) {
    return `/producto?slug=${encodeURIComponent(slug)}`;
  }

  function closeSuggestions() {
    setSuggestionsOpen(false);
    setHighlighted(-1);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    router.push(normalized ? `/productos?q=${encodeURIComponent(normalized)}` : "/productos");
    closeSuggestions();
    setOpen(false);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      closeSuggestions();
      return;
    }
    if (!showSuggestions || suggestions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      // -1 (nada resaltado) es una posición más del ciclo: bajar desde la
      // última sugerencia devuelve el foco al texto escrito, y subir desde
      // ahí salta a la última.
      const step = event.key === "ArrowDown" ? 1 : suggestions.length;
      setHighlighted((current) => ((current + 1 + step) % (suggestions.length + 1)) - 1);
      return;
    }
    if (event.key === "Enter" && highlighted >= 0) {
      // Enter sobre una sugerencia resaltada abre esa ficha en vez de
      // mandar la búsqueda entera al catálogo.
      event.preventDefault();
      router.push(productHref(suggestions[highlighted].slug));
      closeSuggestions();
    }
  }

  // El cartel sólo se cierra si el foco se fue de la barra entera: pasar del
  // input a una sugerencia no lo tiene que hacer desaparecer.
  function handleSearchBlur(event: FocusEvent<HTMLFormElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) closeSuggestions();
  }

  return (
    <>
      <div className="announcement">
        {/* ponytail: 8 copias cubren hasta ~2900px de ancho; si aparece un hueco en pantallas mas grandes, subir el numero */}
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} aria-hidden={i > 0}>
            Envíos a todo el país · Compra segura · Atención personalizada
          </span>
        ))}
      </div>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Litoral Maq, inicio">
          <Image
            src="/brand/AZUL.png"
            alt="Litoral Maq"
            width={176}
            height={64}
            priority
          />
        </Link>
        <form
          className="header-search"
          role="search"
          onSubmit={submitSearch}
          onBlur={handleSearchBlur}
        >
          <label className="sr-only" htmlFor="site-search">Buscar en el catálogo</label>
          <input
            id="site-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSuggestionsOpen(true);
              setHighlighted(-1);
            }}
            onFocus={() => setSuggestionsOpen(true)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Buscar productos, marcas o categorías"
            autoComplete="off"
            role="combobox"
            aria-expanded={showSuggestions}
            aria-controls="site-search-suggestions"
            aria-autocomplete="list"
            aria-activedescendant={
              highlighted >= 0 ? `site-search-option-${highlighted}` : undefined
            }
          />
          <button type="submit" aria-label="Buscar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
          </button>
          {showSuggestions && (
            <div className="search-suggestions">
              {suggestions.length === 0 ? (
                <p className="search-suggestions-empty">
                  No encontramos «{query.trim()}». Probá con menos palabras o mirá el{" "}
                  <Link href="/productos" onClick={closeSuggestions}>catálogo completo</Link>.
                </p>
              ) : (
                <>
                  <ul id="site-search-suggestions" role="listbox" aria-label="Sugerencias">
                    {suggestions.map((product, index) => {
                      const availability = getProductAvailability(product);
                      return (
                        <li
                          key={product.id}
                          id={`site-search-option-${index}`}
                          role="option"
                          aria-selected={index === highlighted}
                        >
                          <Link
                            href={productHref(product.slug)}
                            className={index === highlighted ? "suggestion active" : "suggestion"}
                            onMouseEnter={() => setHighlighted(index)}
                            onClick={() => {
                              closeSuggestions();
                              setOpen(false);
                            }}
                          >
                            <span className="suggestion-thumb">
                              {product.image ? (
                                <Image src={product.image} alt="" fill sizes="44px" />
                              ) : (
                                "LM"
                              )}
                            </span>
                            <span className="suggestion-text">
                              <span className="suggestion-name">{product.name}</span>
                              <span className="suggestion-meta">
                                {product.brand}
                                {product.code && (
                                  <span className="suggestion-code"> · Cód. {product.code}</span>
                                )}
                              </span>
                            </span>
                            <span className="suggestion-side">
                              <span className="suggestion-price">{formatCurrency(product.price)}</span>
                              <span
                                className={`suggestion-stock ${
                                  availability === "available" || availability === "sheet-managed"
                                    ? "in"
                                    : availability === "unknown"
                                      ? "pending"
                                      : "out"
                                }`}
                              >
                                {availabilityLabel(product)}
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  {/* Un Link y no un <button>: `.header-search button` es el
                      círculo azul de la lupa y le impondría su estilo. */}
                  <Link
                    href={`/productos?q=${encodeURIComponent(query.trim())}`}
                    className="search-suggestions-all"
                    onClick={() => {
                      closeSuggestions();
                      setOpen(false);
                    }}
                  >
                    Ver los {results.length} resultados para «{query.trim()}» →
                  </Link>
                </>
              )}
            </div>
          )}
        </form>
        <nav className={open ? "nav open" : "nav"} aria-label="Navegación principal">
          <Link href="/" onClick={() => setOpen(false)}>
            Inicio
          </Link>
          <Link href="/productos" onClick={() => setOpen(false)}>
            Productos
          </Link>
          <Link href="/#productos-estrella" onClick={() => setOpen(false)}>
            Ofertas
          </Link>
          <Link href="/cuenta/pedidos" className="nav-orders-link" onClick={() => setOpen(false)}>
            Mis pedidos {activeOrderCount > 0 && <b>{activeOrderCount}</b>}
          </Link>
        </nav>
        <div className="header-actions">
          <Link href={account ? "/cuenta/pedidos" : "/login"} className="icon-link">
            <span aria-hidden>◎</span>
            <span className="desktop-only">
              {account ? account.user.name.split(" ")[0] || "Mi cuenta" : "Ingresar"}
            </span>
          </Link>
          <Link href="/carrito" className="cart-link" aria-label={`Carrito, ${cartCount} productos`}>
            <Image src="/icons/cart.svg" alt="" width={22} height={22} aria-hidden />
            {cartCount > 0 && <strong>{cartCount}</strong>}
          </Link>
          <button
            type="button"
            className="menu-button"
            aria-label="Abrir menú"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            ☰
          </button>
        </div>
      </header>
    </>
  );
}
