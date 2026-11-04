import { useEffect, useState } from 'react';

export const ROUTES = ['painel', 'agenda', 'clientes', 'financas', 'evolucao', 'ajustes'] as const;
export type Route = (typeof ROUTES)[number];

/** Segmentos do hash: "#/ajustes/aparencia/paleta" → ["ajustes", "aparencia", "paleta"]. */
function segments(hash: string): string[] {
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

function parse(hash: string): Route {
  const r = segments(hash)[0] as Route;
  return ROUTES.includes(r) ? r : 'painel';
}

/** Subpágina (ex.: "aparencia/paleta" em Ajustes); vazio na página principal da rota. */
export function subpathOf(hash: string): string {
  const s = segments(hash);
  return ROUTES.includes(s[0] as Route) ? s.slice(1).join('/') : '';
}

/** Roteamento por hash: funciona no GitHub Pages, em arquivo único e no Capacitor. */
export function useRoute(): Route {
  return useLocation().route;
}

/** Rota e subpágina atuais. */
export function useLocation(): { route: Route; sub: string } {
  const [loc, setLoc] = useState(() => ({ route: parse(window.location.hash), sub: subpathOf(window.location.hash) }));
  useEffect(() => {
    const onChange = () => {
      setLoc({ route: parse(window.location.hash), sub: subpathOf(window.location.hash) });
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return loc;
}

export function navigate(route: Route, sub?: string) {
  window.location.hash = sub ? `/${route}/${sub}` : `/${route}`;
}
