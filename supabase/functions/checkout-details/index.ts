import { handleCheckoutDetails } from "../_shared/checkout-details-handler.ts";

Deno.serve(request => handleCheckoutDetails(request));
