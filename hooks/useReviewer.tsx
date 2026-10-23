"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

// Nome de quem revisa, digitado no topo. Lembrado no navegador.
const KEY = "conforme.revisor";
const DEFAULT = "Carla (TI)";

type Reviewer = { reviewer: string; setReviewer: (v: string) => void };

const Ctx = createContext<Reviewer>({ reviewer: DEFAULT, setReviewer: () => {} });

export function ReviewerProvider({ children }: { children: React.ReactNode }) {
  const [reviewer, setReviewerState] = useState(DEFAULT);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved !== null) setReviewerState(saved);
    } catch {
      // sem storage: fica o padrão
    }
  }, []);

  const value = useMemo(
    () => ({
      reviewer,
      setReviewer: (v: string) => {
        setReviewerState(v);
        try {
          window.localStorage.setItem(KEY, v);
        } catch {
          // ignora
        }
      },
    }),
    [reviewer],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReviewer() {
  return useContext(Ctx);
}
