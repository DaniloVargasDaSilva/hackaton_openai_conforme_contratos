"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "@/lib/api-client";
import type { ReviewBody } from "@/lib/api-client";
import type { InvoiceLine, InvoiceLinePatch } from "@/lib/contracts";
import type { CheckResult3 } from "@/lib/contracts-3vias";
import { errorMessage } from "@/lib/api-error";
import { qk } from "./queries";

// Toda mudança de linha termina num POST /check; o resultado vai direto para o cache
// e atualiza ocorrências, totais e o badge em todas as abas.
function useRecheck(contractId: string) {
  const qc = useQueryClient();
  return async () => {
    const result = await api.runCheck(contractId);
    qc.setQueryData(qk.check(contractId), result);
    return result;
  };
}

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: api.CreateContractBody) => api.createContract(body),
    onSuccess: (detail) => {
      qc.setQueryData(qk.contract(detail.contract.id), detail);
      qc.invalidateQueries({ queryKey: qk.contracts });
    },
  });
}

export function useExtract(contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.extractContract(contractId),
    onSuccess: (detail) => qc.setQueryData(qk.contract(contractId), detail),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUploadNf(contractId: string) {
  const qc = useQueryClient();
  const recheck = useRecheck(contractId);
  return useMutation({
    mutationFn: async (xml: string) => {
      const res = await api.uploadNf(contractId, xml);
      if (res.nf) qc.setQueryData(qk.nf(contractId), res.nf);
      qc.setQueryData(qk.lines(contractId), res.lines);
      if (res.errors.length === 0 || res.nf) await recheck();
      return res;
    },
  });
}

export function useUploadDeliveries(contractId: string) {
  const qc = useQueryClient();
  const recheck = useRecheck(contractId);
  return useMutation({
    mutationFn: async (csv: string) => {
      const res = await api.uploadDeliveries(contractId, csv);
      qc.setQueryData(qk.lines(contractId), res.lines);
      await recheck();
      return res;
    },
  });
}

export function usePatchLine(contractId: string) {
  const qc = useQueryClient();
  const recheck = useRecheck(contractId);
  return useMutation({
    mutationFn: async ({ lineId, patch }: { lineId: string; patch: InvoiceLinePatch }) => {
      const line = await api.patchLine(lineId, patch);
      qc.setQueryData<InvoiceLine[]>(qk.lines(contractId), (old) =>
        old?.map((l) => (l.id === line.id ? line : l)),
      );
      await recheck();
      return line;
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useReview(contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ occurrenceId, body }: { occurrenceId: string; body: ReviewBody }) =>
      api.reviewOccurrence(occurrenceId, body),
    onSuccess: (occ) => {
      // Status e histórico na hora; totais e badge vêm do back no refetch.
      qc.setQueryData<CheckResult3>(qk.check(contractId), (old) =>
        old ? { ...old, occurrences: old.occurrences.map((o) => (o.id === occ.id ? occ : o)) } : old,
      );
      qc.invalidateQueries({ queryKey: qk.check(contractId) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useReport(contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.generateReport(contractId),
    onSuccess: (report) => qc.setQueryData(qk.report(contractId), report),
  });
}
