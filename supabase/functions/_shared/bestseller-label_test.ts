import { canManageBestsellerLabels, validBestsellerChange } from "./bestseller-label.ts";

Deno.test("only admins and employees can manage bestseller labels", () => {
  for (const role of ["admin", "employee"]) if (!canManageBestsellerLabels(role)) throw new Error("Staff denied");
  for (const role of ["customer", "anonymous", null, undefined, "owner"]) if (canManageBestsellerLabels(role)) throw new Error("Unauthorized role allowed");
});
Deno.test("the endpoint never accepts prices, stock or roles", () => {
  const body = { productId: "3381", bestSeller: true, updatedAt: "2026-10-11T00:00:00Z" };
  if (!validBestsellerChange(body)) throw new Error("Valid change rejected");
  for (const extra of ["price", "stock", "role", "featured", "active"]) if (validBestsellerChange({ ...body, [extra]: 1 })) throw new Error("Extra field accepted");
  for (const invalid of [null, [], { ...body, bestSeller: "true" }, { ...body, productId: "" }, { ...body, updatedAt: "invalid" }]) if (validBestsellerChange(invalid)) throw new Error("Invalid change accepted");
});
