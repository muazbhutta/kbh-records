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
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export const queryKeys = {
  people: (search?: string, showDisabled?: boolean) =>
    ['people', { search: search ?? '', showDisabled: !!showDisabled }] as const,
  person: (id: string) => ['person', id] as const,
  me: () => ['me'] as const,
};
