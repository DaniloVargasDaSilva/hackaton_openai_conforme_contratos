import { dateTime } from "@/lib/format";
import type { Review } from "@/lib/contracts";

const verb = { pendente: "Marcada como pendente", confirmada: "Confirmada", descartada: "Descartada" } as const;

export function ReviewHistory({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) {
    return <p className="m-0 text-[14px] text-tinta-fraca">Ainda sem revisão</p>;
  }
  return (
    <ul className="m-0 list-none border-l-2 border-filete-forte py-0 pl-3 text-[14px] leading-normal">
      {reviews.map((r) => (
        <li key={r.id} className="mb-2 last:mb-0">
          <b className="font-semibold">{verb[r.status]}</b> por {r.reviewer} em{" "}
          <span className="num">{dateTime(r.createdAt)}</span>
          {r.comment && <div className="italic text-tinta-fraca">“{r.comment}”</div>}
        </li>
      ))}
    </ul>
  );
}
