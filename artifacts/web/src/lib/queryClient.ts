import {
  QueryClient,
  MutationCache,
  QueryCache,
  type Query,
} from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";
import { describeApiError } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

/**
 * Opt-in marker placed on react-query `meta` to silence the destructive 404
 * toast for benign auxiliary reads (tag pickers, receipt thumbnails, dropdown
 * catalogs, etc.). Primary page loads (e.g. `useGetReport`) deliberately do
 * NOT carry this marker — they should still surface a toast (and/or rely on
 * the page's own empty-state) so a real "report not found" is debuggable.
 */
export const SILENT_404_META = { silent404: true } as const;

function isAuxiliaryQuery404(
  err: unknown,
  query: Query<unknown, unknown, unknown>,
): boolean {
  if (!(err instanceof ApiError) || err.status !== 404) return false;
  const meta = query.meta as { silent404?: unknown } | undefined;
  return meta?.silent404 === true;
}

function shouldSurfaceMutationError(err: unknown): boolean {
  if (err instanceof ApiError && err.status === 401) return false;
  return true;
}

function shouldSurfaceQueryError(
  err: unknown,
  query: Query<unknown, unknown, unknown>,
): boolean {
  if (err instanceof ApiError && err.status === 401) return false;
  // Auxiliary reads opt out of the destructive 404 toast via meta.silent404.
  // Primary loads (no meta) still toast so genuine "missing resource" cases
  // remain visible to engineers and don't silently mask a real bug.
  if (isAuxiliaryQuery404(err, query)) return false;
  return true;
}

function showToast(err: unknown) {
  const { title, detail, status } = describeApiError(err);
  toast({
    variant: "destructive",
    title: status ? `${title}` : title,
    description: detail,
  });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      // Don't toast background refetch failures — only the first failure.
      if (
        query.state.data === undefined &&
        shouldSurfaceQueryError(err, query)
      ) {
        showToast(err);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (err) => {
      if (shouldSurfaceMutationError(err)) showToast(err);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Pages that the user routinely navigates away from and back to (My
      // Reports, Manager Queue, Finance Review, Admin lists, etc.) need to
      // reflect changes made elsewhere — including by mutations that ran
      // on a different screen — without making the user hit browser
      // refresh. With staleTime at 30s, react-query would otherwise serve
      // a cached snapshot for that window. Setting `refetchOnMount` to
      // "always" keeps the cached snapshot visible instantly (no flash
      // of loading state) while triggering a background refetch on every
      // mount, so the on-screen data is brought up to date as soon as the
      // network responds.
      refetchOnMount: "always",
      retry: (failureCount, err) => {
        // Don't retry auth/permission errors, only transient server errors.
        if (err instanceof ApiError) {
          if (err.status === 401 || err.status === 403 || err.status === 404) {
            return false;
          }
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
