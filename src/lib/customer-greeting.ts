/** Display only: never use the greeting to identify or authorize a customer. */
export function customerGreeting(name: string) {
  const firstName = name.trim().split(/\s+/)[0];
  return firstName && !firstName.includes("@") ? `Hola, ${firstName}` : "Hola";
}
