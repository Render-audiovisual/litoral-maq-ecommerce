import type { Metadata } from "next";
import { readStoreDomain } from "@/lib/domain-config";
import { HomeClient } from "./home-client";

// Canonical propio de la home: si se lo diera el layout raíz, cascadearía
// "/" a todas las páginas hijas (fichas de producto, admin, etc.).
const storeDomain = readStoreDomain();

export const metadata: Metadata =
  storeDomain.status === "ok" ? { alternates: { canonical: "/" } } : {};

export default function Home() {
  return <HomeClient />;
}
