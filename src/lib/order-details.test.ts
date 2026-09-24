import { describe, expect, it } from "vitest";
import type { Order, Product } from "./types";
import {
  adminOrderStatusLabel,
  buildOrderAddress,
  deliveryLabel,
  provinceName,
  ADMIN_ORDER_STATUS_LABELS,
  isActiveOrder,
  ORDER_STATUS_MESSAGES,
  orderStatusLabel,
  orderStatusMessage,
  orderStatusOptions,
  resolveOrderLines,
  snapshotOrderLines,
} from "./order-details";

const product = { id: "p1", name: "Taladro", code: "T-1", price: 250 } as Product;

describe("detalle histórico de pedidos", () => {
  it("guarda nombre, código y precio vigentes al crear el pedido", () => {
    expect(snapshotOrderLines([{ productId: "p1", quantity: 2 }], [product])).toEqual([{
      productId: "p1", quantity: 2, productName: "Taladro", productCode: "T-1", unitPrice: 250,
    }]);
  });

  it("prioriza la foto histórica aunque el catálogo cambie", () => {
    const order = { lines: [{ productId: "p1", quantity: 2, productName: "Nombre original", productCode: "T-1", unitPrice: 200 }] } as Order;
    const resolved = resolveOrderLines(order, [{ ...product, name: "Nombre nuevo", price: 999 }]);
    expect(resolved[0]).toMatchObject({ productName: "Nombre original", unitPrice: 200, lineTotal: 400, historicalSnapshot: true });
  });

  it("resuelve pedidos heredados con el catálogo actual", () => {
    const order = { lines: [{ productId: "p1", quantity: 1 }] } as Order;
    expect(resolveOrderLines(order, [product])[0]).toMatchObject({ productName: "Taladro", unitPrice: 250, historicalSnapshot: false });
  });

  it("expone mensajes de seguimiento y distingue pedidos activos", () => {
    expect(ORDER_STATUS_MESSAGES.pendiente).toMatch(/Mercado Pago acredita el pago/i);
    expect(isActiveOrder({ status: "preparando" } as Order)).toBe(true);
    expect(isActiveOrder({ status: "entregado" } as Order)).toBe(false);
  });

  it("enumera el circuito operativo del panel desde el paso cero", () => {
    expect(ADMIN_ORDER_STATUS_LABELS.pendiente).toBe("Paso 0 · Pedido recibido");
    expect(ADMIN_ORDER_STATUS_LABELS.preparando).toBe("Paso 1 · Preparando");
    expect(ADMIN_ORDER_STATUS_LABELS.listo).toBe("Paso 2 · Listo para entregar");
    expect(ADMIN_ORDER_STATUS_LABELS.enviado).toBe("Paso 3 · Enviado");
    expect(ADMIN_ORDER_STATUS_LABELS.entregado).toBe("Paso 4 · Entregado");
    expect(ADMIN_ORDER_STATUS_LABELS.cancelado).not.toMatch(/Paso/);
  });

  it("acorta el circuito de retiro y adapta sus etiquetas", () => {
    const pickup = {
      status: "preparando",
      deliveryMethod: "retiro",
    } as Order;

    expect(orderStatusOptions(pickup)).toEqual([
      "pendiente",
      "preparando",
      "listo",
      "entregado",
      "cancelado",
    ]);
    expect(orderStatusOptions(pickup)).not.toContain("enviado");
    expect(adminOrderStatusLabel("listo", "retiro")).toBe(
      "Paso 2 · Listo para retirar",
    );
    expect(adminOrderStatusLabel("entregado", "retiro")).toBe(
      "Retirado",
    );
    expect(adminOrderStatusLabel("cancelado", "retiro")).toBe("Cancelado");
    expect(orderStatusLabel({ ...pickup, status: "listo" })).toBe(
      "Listo para retirar",
    );
    expect(orderStatusMessage({ ...pickup, status: "entregado" })).toMatch(
      /retirado de la sucursal/i,
    );
  });

  it("mantiene el circuito completo para envíos por logística", () => {
    const shipping = {
      status: "preparando",
      deliveryMethod: "envio",
    } as Order;

    expect(orderStatusOptions(shipping)).toContain("enviado");
    expect(adminOrderStatusLabel("listo", "envio")).toBe(
      "Paso 2 · Listo para despachar",
    );
  });
});

describe("pedidos a sucursal del correo", () => {
  const form = {
    street: "San Juan", streetNumber: "1234", floor: "2", apartment: "B",
    locality: " La Plata ", postalCode: "1900",
  };

  it("sin cotización guarda el destino, nunca la calle del domicilio", () => {
    expect(buildOrderAddress({ ...form, deliveryType: "sucursal" }))
      .toBe("Sucursal del correo a coordinar · La Plata · CP 1900");
  });

  it("con sucursal cotizada guarda la sucursal", () => {
    expect(buildOrderAddress({ ...form, deliveryType: "sucursal", branchName: "OCA Centro", branchAddress: "Calle 7 100" }))
      .toBe("OCA Centro · Calle 7 100");
  });

  it("a domicilio guarda calle, piso y depto", () => {
    expect(buildOrderAddress({ ...form, deliveryType: "domicilio" }))
      .toBe("San Juan 1234 · Piso 2 · Depto B · La Plata · CP 1900");
  });

  it("la etiqueta de entrega distingue sucursal, domicilio y retiro", () => {
    expect(deliveryLabel({ deliveryMethod: "envio", shippingDeliveryType: "sucursal" })).toBe("Envío a sucursal del correo");
    expect(deliveryLabel({ deliveryMethod: "envio", shippingDeliveryType: "domicilio" })).toBe("Envío a domicilio");
    expect(deliveryLabel({ deliveryMethod: "envio" })).toBe("Envío a domicilio");
    expect(deliveryLabel({ deliveryMethod: "retiro" })).toBe("Retiro en Sáenz 1587");
  });

  it("muestra el nombre de la provincia en vez del código", () => {
    expect(provinceName("W")).toBe("Corrientes");
    expect(provinceName("Chaco")).toBe("Chaco");
    expect(provinceName(undefined)).toBe("");
  });
});
