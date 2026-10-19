import { QueryClient } from '@tanstack/react-query';

/**
 * One shared cache. Lists stay usable while they refetch in the
 * background, which is what makes the app feel instant on a weak site
 * connection.
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        // Several people keep these books at once. Coming back to the app
        // after a minute away should not show a balance from before the
        // cash was handed over, so what is on screen is refreshed on the
        // way back in - and, because of staleTime above, only when it is
        // actually old enough to be worth a request.
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

/**
 * Everything on every screen is a view of the same books: a balance, a
 * khata, a dashboard figure, a project's total, a team's spending. One
 * entry recorded changes most of them at once.
 *
 * So a write does not try to name the things it touched. It says the
 * books have changed, and every view of them is marked stale - the ones
 * on screen refetch at once, the rest the next time they are opened.
 *
 * This is deliberately blunt. Naming keys at each mutation is how a
 * dashboard ends up showing yesterday's figure after this morning's
 * expense: the list is right on the day it is written and quietly wrong
 * every time a screen is added afterwards. It happened here.
 */
export function refreshTheBooks(qc: QueryClient) {
  void qc.invalidateQueries();
}

export const queryKeys = {
  people: (search?: string, showDisabled?: boolean) =>
    ['people', { search: search ?? '', showDisabled: !!showDisabled }] as const,
  person: (id: string) => ['person', id] as const,
  me: () => ['me'] as const,
};
