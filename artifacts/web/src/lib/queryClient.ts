import { QueryClient, MutationCache, QueryCache } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";
import { describeApiError } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

function shouldSurfaceError(err: unknown): boolean {
  if (err instanceof ApiError) {
    // Login form already surfaces 401 inline; everything else is fair game.
    if (err.status === 401) return false;
  }
  return true;
}

function showErrorToast(err: unknown) {
  if (!shouldSurfaceError(err)) return;
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
      if ((query.state.data === undefined) && shouldSurfaceError(err)) {
        showErrorToast(err);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (err) => {
      showErrorToast(err);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
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
