import type { NfDocument as Nf } from "@/lib/contracts-3vias";
import { amount, date, money, number } from "@/lib/format";

const AVISO = "DOCUMENTO FICTÍCIO · SEM VALOR FISCAL";

// DANFE simplificado, só para a demo. Marca d'água diagonal + faixa de aviso: nunca parece nota real.
export function NfDocument({ nf }: { nf: Nf | null }) {
  if (!nf) {
    return (
      <article className="folha flex min-h-[260px] items-center justify-center p-6 text-center">
        <p className="text-tinta-fraca" style={{ fontSize: 15 }}>
          Envie o XML da NF para ver a nota aqui
        </p>
      </article>
    );
  }

  return (
    <article className="folha relative overflow-hidden" aria-label={`Nota fiscal fictícia ${nf.number}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 grid place-items-center"
      >
        <span
          className="font-ui font-semibold text-falta"
          style={{
            transform: "rotate(-24deg)",
            fontSize: 24,
            letterSpacing: ".1em",
            opacity: 0.06,
            textAlign: "center",
            lineHeight: 1.5,
            maxWidth: 340,
          }}
        >
          {AVISO}
        </span>
      </div>

      <div
        className="border-b border-falta-borda bg-falta-leve px-5 py-1.5 text-center font-ui text-[13px] font-semibold tracking-wide text-falta"
        role="note"
      >
        {AVISO}
      </div>

      <div className="relative px-5 pb-4 pt-4">
        <div className="border-b-2 border-tinta pb-2">
          <b className="text-[17px]">DANFE simplificado</b>
          <div className="num text-[13px]">
            NF {nf.number} · série {nf.series} · emitida em {date(nf.issuedAt)}
          </div>
        </div>

        <div className="my-3 grid grid-cols-2 gap-3 text-[13px] leading-snug">
          <Party label="Emitente" name={nf.issuer.name} cnpj={nf.issuer.cnpj} />
          <Party label="Destinatário" name={nf.recipient.name} cnpj={nf.recipient.cnpj} />
        </div>

        <table className="w-full border-collapse">
          <tbody>
            {nf.items.map((it) => (
              <tr key={it.line} className="align-top">
                <td className="border-b border-filete py-1.5 pr-2 text-[13px]">
                  {it.line} {it.description}
                </td>
                <td className="num whitespace-nowrap border-b border-filete py-1.5 text-right text-[13px]">
                  {number(it.qty)} × {amount(it.unitPrice)}
                </td>
                <td className="num whitespace-nowrap border-b border-filete py-1.5 pl-3 text-right text-[13px]">
                  {amount(it.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-2.5 text-[13px]">
          <div className="flex justify-between">
            <span>Descontos</span>
            {nf.discounts.length === 0 && <span className="num">{money(0)}</span>}
          </div>
          {nf.discounts.map((d, i) => (
            <div key={i} className="flex justify-between text-tinta-fraca">
              <span>{d.description}</span>
              <span className="num">− {money(d.amount)}</span>
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-baseline justify-between border-t-2 border-tinta pt-2">
          <b>Total da nota</b>
          <span className="num text-[22px] font-semibold">{money(nf.total)}</span>
        </div>
      </div>
    </article>
  );
}

function Party({ label, name, cnpj }: { label: string; name: string; cnpj: string }) {
  return (
    <div>
      <span className="block font-ui text-[13px] text-tinta-fraca">{label}</span>
      {name}
      <br />
      <span className="num">{cnpj}</span>
    </div>
  );
}
