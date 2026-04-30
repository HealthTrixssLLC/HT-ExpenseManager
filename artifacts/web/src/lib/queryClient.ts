import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client-react";

export const queryClient = new QueryClient({
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
