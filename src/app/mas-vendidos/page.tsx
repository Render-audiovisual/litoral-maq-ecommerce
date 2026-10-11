import { Suspense } from "react";
import { CatalogClient } from "../productos/catalog-client";

export const metadata = { title: "Más vendidos" };

export default function BestsellersPage() {
  return (
    <Suspense fallback={<main className="center-state"><div className="spinner" /></main>}>
      <CatalogClient bestsellersOnly />
    </Suspense>
  );
}
