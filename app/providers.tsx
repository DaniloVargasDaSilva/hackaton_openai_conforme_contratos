"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { ApiClientError, isApiDown } from "@/lib/api-error";
import { ApiStatusProvider, useApiStatus } from "@/hooks/useApiStatus";
import { ReviewerProvider } from "@/hooks/useReviewer";

function QueryProvider({ children }: { children: React.ReactNode }) {
  const { setDown } = useApiStatus();
  const [client] = useState(() => {
    const onError = (err: unknown) => setDown(isApiDown(err));
    const onSuccess = () => setDown(false);
    return new QueryClient({
      queryCache: new QueryCache({ onError, onSuccess }),
      mutationCache: new MutationCache({ onError, onSuccess }),
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          refetchOnWindowFocus: false,
          // 4xx não adianta repetir; rede/5xx tenta uma vez.
          retry: (count, err) =>
            count < 1 && !(err instanceof ApiClientError && err.status >= 400 && err.status < 500),
        },
      },
    });
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ApiStatusProvider>
      <QueryProvider>
        <ReviewerProvider>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </ReviewerProvider>
      </QueryProvider>
    </ApiStatusProvider>
  );
}
