import { describe, expect, it } from "vitest";
import { CHECKOUT_DETAIL_KEYS, parseSavedCheckoutDetails } from "./saved-checkout-details";

const details = Object.fromEntries(CHECKOUT_DETAIL_KEYS.map(key => [key, ""])) as Record<string,string>;
describe("saved checkout details", () => {
  it("keeps partial contact/delivery data and trims it", () => {
    expect(parseSavedCheckoutDetails({...details,firstName:"  Ana  ",dni:"12345678"})).toMatchObject({firstName:"Ana",dni:"12345678",street:""});
  });
  it("does not retain identity, permissions or payment data", () => {
    const parsed=parseSavedCheckoutDetails({...details,customerId:"other",role:"admin",cardNumber:"private",total:0});
    expect(Object.keys(parsed)).toEqual([...CHECKOUT_DETAIL_KEYS]);
  });
  it.each([null, [], "bad", {...details,phone:123}, {...details,street:"x".repeat(241)}, {...details,dni:"abc"}])("rejects invalid data", value => {
    expect(()=>parseSavedCheckoutDetails(value)).toThrow();
  });
});
