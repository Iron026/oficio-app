import { useEffect, useState } from 'react';

export const ROUTES = ['painel', 'agenda', 'clientes', 'financas', 'evolucao', 'ajustes'] as const;
export type Route = (typeof ROUTES)[number];

function parse(hash: string): Route {
  const r = hash.replace(/^#\/?/, '').split('/')[0] as Route;
  return ROUTES.includes(r) ? r : 'painel';
}

/** Roteamento por hash: funciona no GitHub Pages, em arquivo único e no Capacitor. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(route: Route) {
  window.location.hash = `/${route}`;
}
