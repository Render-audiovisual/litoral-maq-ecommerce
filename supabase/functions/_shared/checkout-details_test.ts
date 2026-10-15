import { handleCheckoutDetails } from "./checkout-details-handler.ts";
import { CHECKOUT_DETAIL_KEYS } from "./saved-checkout-details.ts";

const details = Object.fromEntries(CHECKOUT_DETAIL_KEYS.map(key => [key, ""]));
function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
function fakeDb(user: Record<string,unknown>|null) {
  const calls: Array<unknown[]> = [];
  const db = {
    auth: {getUser: () => Promise.resolve({data:{user},error:null})},
    from: (table: string) => {
      calls.push(["from",table]);
      return {
        select: () => ({eq: (column:string,id:string) => {
          calls.push(["eq",column,id]);
          return {maybeSingle:()=>Promise.resolve({data:{details},error:null})};
        }}),
        upsert: (data:unknown) => { calls.push(["upsert",data]); return Promise.resolve({error:null}); },
      };
    },
  };
  return {calls, db:db as unknown as NonNullable<Parameters<typeof handleCheckoutDetails>[1]>};
}
function request(body:unknown) {
  return new Request("https://example.com/checkout-details",{method:"POST",headers:{Authorization:"Bearer test", "Content-Type":"application/json"},body:JSON.stringify(body)});
}
const verified={id:"account-a",is_anonymous:false,email_confirmed_at:"2026-01-01"};
async function handle(body: unknown, db: NonNullable<Parameters<typeof handleCheckoutDetails>[1]>) {
  const getEnv = Deno.env.get;
  // No real environment credentials are read by these isolated fixtures.
  Deno.env.get = () => undefined;
  try { return await handleCheckoutDetails(request(body), db); }
  finally { Deno.env.get = getEnv; }
}
Deno.test("saved details: only authenticated verified accounts",async()=>{
  for(const user of [null,{...verified,is_anonymous:true},{...verified,email_confirmed_at:null}]) {
    const {db,calls}=fakeDb(user);
    const response=await handle({operation:"read"},db);
    assert(response.status===401||response.status===403,"must reject account");
    assert(calls.length===0,"must not access data");
  }
});
Deno.test("saved details: read always scopes to verified identity",async()=>{
  const {db,calls}=fakeDb(verified);
  const response=await handle({operation:"read",customerId:"other"},db);
  assert(response.status===200,"read succeeds");
  assert(JSON.stringify(calls).includes('["eq","customer_id","account-a"]'),"must scope owner");
});
Deno.test("saved details: explicit consent, session binding, valid body",async()=>{
  for(const body of [null,[],{operation:"save",accountId:"account-a",details},{operation:"save",consent:true,accountId:"other",details}]) {
    const {db,calls}=fakeDb(verified);
    const response=await handle(body,db);
    assert(response.status>=400&&response.status<500,"must reject invalid save");
    assert(calls.length===0,"must not write");
  }
});
Deno.test("saved details: saves whitelisted fields, never caller permissions",async()=>{
  const {db,calls}=fakeDb(verified);
  const response=await handle({operation:"save",consent:true,accountId:"account-a",details:{...details,role:"admin",cardNumber:"private"}},db);
  assert(response.status===200,"save succeeds");
  const stored=calls.find(call=>call[0]==="upsert")?.[1] as {customer_id:string;details:Record<string,unknown>};
  assert(stored.customer_id==="account-a","correct owner");
  assert(!("role" in stored.details)&&!("cardNumber" in stored.details),"only checkout data");
});
