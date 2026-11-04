// Never trust user-supplied identity headers. Access supplies this runtime context.
export function createHandler(assets) {
  return async function fetch(request, env, ctx) {
    const headers = {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    };
    const respond = (body, status, type = 'text/plain') => new Response(request.method === 'HEAD' ? null : body, {
      status, headers: { ...headers, 'Content-Type': `${type}; charset=utf-8` }
    });
    if (!ctx?.access) return respond('Inloggning krävs. Cloudflare Access måste vara aktiverat för Jourplaneraren.', 403);
    let identity;
    try { identity = await ctx.access.getIdentity(); }
    catch { return respond('Inloggningen kunde inte verifieras. Försök igen.', 503); }
    if (!env.ALLOWED_EMAIL || identity?.email?.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()) {
      return respond('Du har inte åtkomst till Jourplaneraren.', 403);
    }
    if (!['GET', 'HEAD'].includes(request.method)) return respond('Metoden stöds inte.', 405);
    const path = new URL(request.url).pathname;
    if (path === '/api/me') return respond(JSON.stringify({ email: identity.email }), 200, 'application/json');
    const asset = assets[path];
    return asset ? respond(asset.body, 200, asset.type) : respond('Sidan finns inte.', 404);
  };
}
