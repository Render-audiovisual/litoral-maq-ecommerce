export function canManageBestsellerLabels(role: unknown): boolean {
  return role === "admin" || role === "employee";
}

export function validBestsellerChange(body: unknown): body is { productId: string; bestSeller: boolean; updatedAt: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const value = body as Record<string, unknown>;
  return Object.keys(value).every((key) => ["productId", "bestSeller", "updatedAt"].includes(key)) &&
    typeof value.productId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value.productId) &&
    typeof value.bestSeller === "boolean" && typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt));
}
