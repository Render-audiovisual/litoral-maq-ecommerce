import { notFound } from "next/navigation";
import { HomeClient } from "../home-client";
import { WelcomeDiscountPreview } from "@/components/welcome-discount-preview";

export default function DiscountProposal() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <><HomeClient /><WelcomeDiscountPreview forcePreview /></>;
}
