"use client";

import { useQuery } from "@tanstack/react-query";
import * as api from "@/lib/api-client";

export const qk = {
  contracts: ["contracts"] as const,
  contract: (id: string) => ["contract", id] as const,
  lines: (id: string) => ["lines", id] as const,
  nf: (id: string) => ["nf", id] as const,
  check: (id: string) => ["check", id] as const,
  report: (id: string) => ["report", id] as const,
};

export function useContracts() {
  return useQuery({ queryKey: qk.contracts, queryFn: api.getContracts });
}

export function useContract(id: string) {
  return useQuery({ queryKey: qk.contract(id), queryFn: () => api.getContract(id) });
}

export function useLines(id: string) {
  return useQuery({ queryKey: qk.lines(id), queryFn: () => api.getLines(id) });
}

export function useNf(id: string) {
  return useQuery({ queryKey: qk.nf(id), queryFn: () => api.getNf(id) });
}

// Ocorrências, oportunidades e totais. Badge da aba = totals.pendingCount.
export function useCheck(id: string) {
  return useQuery({ queryKey: qk.check(id), queryFn: () => api.getCheck(id) });
}
