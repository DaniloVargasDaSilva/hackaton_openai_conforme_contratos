"use client";

import { createContext, useContext, useMemo, useState } from "react";

// Liga a faixa "API fora do ar" quando qualquer chamada falha por rede.
type ApiStatus = { down: boolean; setDown: (v: boolean) => void };

const Ctx = createContext<ApiStatus>({ down: false, setDown: () => {} });

export function ApiStatusProvider({ children }: { children: React.ReactNode }) {
  const [down, setDown] = useState(false);
  const value = useMemo(() => ({ down, setDown }), [down]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApiStatus() {
  return useContext(Ctx);
}
