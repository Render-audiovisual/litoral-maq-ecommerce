export const APACHE_SECURITY_HEADERS = `<IfModule mod_headers.c>
  Header set Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com; form-action 'self' https://*.supabase.co https://accounts.google.com https://www.mercadopago.com https://www.mercadopago.com.ar; upgrade-insecure-requests"
  Header set Strict-Transport-Security "max-age=31536000"
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "DENY"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
  Header set Permissions-Policy "camera=(), microphone=(), geolocation=()"
  Header set Cross-Origin-Opener-Policy "same-origin-allow-popups"
</IfModule>`;
