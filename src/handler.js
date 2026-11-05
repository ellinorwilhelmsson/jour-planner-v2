import { commitCommand, historyPage, readWorkspace } from './store.js';
import { AppError, publicationChanges } from './model.js';
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
    const allowed=(env.ALLOWED_EMAILS??env.ALLOWED_EMAIL??'').split(',').map(email=>email.trim().toLowerCase()).filter(Boolean);
    if (!identity?.email || !allowed.includes(identity.email.toLowerCase())) {
      return respond('Du har inte åtkomst till Jourplaneraren.', 403);
    }
    const url=new URL(request.url),path=url.pathname;
    const json=(value,status=200)=>respond(JSON.stringify(value),status,'application/json');
    if (path === '/api/me') return json({ email: identity.email, local: env.LOCAL_DEMO==='true', googleConfigured:Boolean(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.TOKEN_ENCRYPTION_KEY) });
    if(path.startsWith('/api/')) {
      try {
        if(request.method==='GET'&&path==='/api/state') return json(await readWorkspace(env.DB,env.LOCAL_DEMO==='true'));
        if(request.method==='GET'&&path==='/api/revision') {
          if(!env.DB) throw new AppError('Lagringen är inte konfigurerad.',503);
          const row=await env.DB.prepare('SELECT revision FROM app_state WHERE id=1').first();return json({revision:row?.revision??0});
        }
        if(request.method==='GET'&&path==='/api/history') return json({events:await historyPage(env.DB,url.searchParams.get('scope')??'all',Number(url.searchParams.get('before')??Number.MAX_SAFE_INTEGER))});
        if(request.method==='GET'&&path==='/api/calendar/review') {
          const current=await readWorkspace(env.DB,env.LOCAL_DEMO==='true');const period=current.state.periods.find(p=>p.id===url.searchParams.get('period'));
          if(!period) throw new AppError('Perioden saknas.',404);
          return json({revision:current.revision,changes:publicationChanges(current.state,period)});
        }
        if(request.method==='POST'&&path==='/api/commands') {
          if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Anropet måste komma från appen.'},403);
          const raw=await request.text();if(raw.length>500_000) return json({error:'Underlaget är för stort.'},413);
          let command;try {command=JSON.parse(raw);} catch {return json({error:'Ogiltigt underlag.'},400);}
          return json(await commitCommand(env.DB,command,identity.email,env.LOCAL_DEMO==='true'));
        }
        return json({error:'API-anropet stöds inte.'},404);
      } catch(error) { return json({error:error instanceof AppError?error.message:'Lagringen kunde inte nås. Ändringen har inte bekräftats.'},error instanceof AppError?error.status:503); }
    }
    if (!['GET', 'HEAD'].includes(request.method)) return respond('Metoden stöds inte.', 405);
    const asset = assets[path];
    return asset ? respond(asset.body, 200, asset.type) : respond('Sidan finns inte.', 404);
  };
}
