import { Suspense } from "react";
import { CatalogClient } from "./catalog-client";

export const metadata = { title: "Productos" };

export default function ProductsPage() {
  return (
    <Suspense fallback={<main className="center-state"><div className="spinner" /></main>}>
      <CatalogClient />
    </Suspense>
  );
}
