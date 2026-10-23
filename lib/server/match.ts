// Dan: casa o código ou a descrição de um produto (da NF, do CSV, da foto) com um item do contrato.
//
// O contrato de demonstração usa ids curtos (suite, crm, tokens…). Um contrato extraído pela IA tem ids
// tirados do nome ("suite-de-produtividade"), e a NF de um fornecedor traz o código dele. Casar só por id
// idêntico fazia toda linha ficar sem par. Aqui o id vem primeiro; depois o prefixo; por fim as palavras.

type ItemRef = { id: string; name: string };

/** Minúsculas, sem acento. */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Palavras que identificam (mais de 2 letras), sem repetição. */
const words = (s: string) => new Set(fold(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2));

/** Devolve o id do item do contrato que corresponde ao produto, ou null se não houver um par claro. */
export function resolveItemId(items: ItemRef[], code: string, description = ""): string | null {
  const c = fold(code);

  // 1. id idêntico (com ou sem maiúsculas e acentos)
  const exact = items.find((i) => i.id === code) ?? items.find((i) => fold(i.id) === c);
  if (exact) return exact.id;

  // 2. um id é o começo do outro ("suite" × "suite-de-produtividade"), só se der um único item
  if (c.length >= 3) {
    const prefix = items.filter((i) => {
      const id = fold(i.id);
      return id.startsWith(`${c}-`) || (id.length >= 3 && c.startsWith(`${id}-`));
    });
    if (prefix.length === 1) return prefix[0].id;
  }

  // 3. palavras em comum entre o produto (código + descrição) e o nome do item
  const target = words(`${code} ${description}`);
  if (target.size === 0) return null;

  const scored = items
    .map((item) => {
      const itemWords = words(item.name);
      const shared = [...itemWords].filter((w) => target.has(w)).length;
      const score = itemWords.size === 0 ? 0 : shared / Math.min(itemWords.size, target.size);
      return { id: item.id, shared, score };
    })
    .filter((s) => s.shared >= 1 && s.score >= 0.5)
    .sort((a, b) => b.score - a.score || b.shared - a.shared);

  if (scored.length === 0) return null;
  // Empate no topo é ambíguo: melhor não casar do que casar com o item errado.
  if (scored.length > 1 && scored[0].score === scored[1].score && scored[0].shared === scored[1].shared) return null;
  return scored[0].id;
}
