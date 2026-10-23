"""Gera os documentos FICTÍCIOS da demo do Conforme a partir do seed e do XML.

  python data/demo/fontes/gerar_pdfs.py

Saídas (em public/demo/ e cópia em data/demo/):
  contrato-042-2026-ficticio.pdf  contrato com cabeçalho, partes, cláusulas e assinaturas
  contrato-042-2026-ficticio.txt  demoContract.text do seed, idêntico (o upload do app aceita só texto)
  nf-8812-ficticia.pdf            DANFE simplificado, linha a linha igual a nf-8812-ficticia.xml
HTML-fonte gerado ao lado deste script. No fim, confere por busca literal que cada
clauses[].text do seed aparece no texto extraído do PDF do contrato.

Requer: playwright (python) com Chromium instalado e pypdf.
"""
import html
import json
import re
import shutil
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from playwright.sync_api import sync_playwright
from pypdf import PdfReader

FONTES = Path(__file__).resolve().parent
RAIZ = FONTES.parents[2]
SEED = RAIZ / "data" / "seed-demo.json"
XML = RAIZ / "data" / "demo" / "nf-8812-ficticia.xml"
PUBLICO = RAIZ / "public" / "demo"
DADOS = RAIZ / "data" / "demo"

CONTRATO = "contrato-042-2026-ficticio"
NF = "nf-8812-ficticia"

# CNPJs obviamente falsos (os mesmos do XML)
CNPJ_CONTRATANTE = "11.111.111/0001-11"
CNPJ_CONTRATADA = "00.000.000/0001-00"

GOOGLE_FONTS = (
    "https://fonts.googleapis.com/css2?"
    "family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400"
    "&family=IBM+Plex+Mono:wght@400;600&display=block"
)

BASE_CSS = """
:root{--tinta:#1b1d22;--fraca:#5b606b;--filete:#c9ccd3;--fundo:#f4f5f7;--azul:#1c46c4}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:var(--tinta)}
body{font-family:"Source Serif 4",Georgia,serif;font-size:10.5pt;line-height:1.5;
  font-variant-ligatures:none;font-feature-settings:"liga" 0,"clig" 0;
  font-variant-numeric:tabular-nums;hyphens:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.num{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
.marca{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
  pointer-events:none;z-index:0}
.marca span{transform:rotate(-32deg);font-family:"IBM Plex Mono",monospace;font-weight:600;
  font-size:34pt;line-height:1.5;letter-spacing:.08em;color:rgba(27,29,34,.085);text-align:center;white-space:nowrap}
.faixa{border:1px solid var(--tinta);text-align:center;font-family:"IBM Plex Mono",monospace;
  font-size:8.5pt;font-weight:600;letter-spacing:.12em;padding:4px 0;margin-bottom:14px}
main{position:relative;z-index:1}
"""


def esc(t):
    return html.escape(t, quote=False)


def brl(v, casas=2):
    s = f"{v:,.{casas}f}"
    return s.replace(",", "§").replace(".", ",").replace("§", ".")


def qtd(v):
    return brl(v, 0) if float(v).is_integer() else brl(v, 2)


def pagina(titulo, css, corpo):
    return f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>{esc(titulo)}</title>
<link rel="stylesheet" href="{GOOGLE_FONTS}">
<style>{BASE_CSS}{css}</style></head>
<body>{corpo}</body></html>
"""


# ---------------------------------------------------------------- contrato

CONTRATO_CSS = """
@page{size:A4;margin:22mm 22mm 20mm}
h1{font-size:13pt;font-weight:700;text-align:center;line-height:1.35;margin:4px 0 6px;letter-spacing:.01em;text-wrap:balance}
.resumo{text-align:center;color:var(--fraca);font-style:italic;margin:0 0 18px}
h2{font-size:10.5pt;font-weight:700;letter-spacing:.04em;margin:16px 0 6px;break-after:avoid}
p{margin:0 0 7px;text-align:justify}
p.item{padding-left:2.4em;text-indent:-2.4em}
p.item b{display:inline-block;width:2.4em;text-indent:0;font-weight:600}
.local{margin:22px 0 30px;text-align:right}
.assinaturas{display:grid;grid-template-columns:1fr 1fr;column-gap:16mm;row-gap:16mm;break-inside:avoid}
.assinatura{border-top:1px solid var(--tinta);padding-top:5px;font-size:9.5pt;line-height:1.4}
.assinatura small{display:block;color:var(--fraca);font-size:8.5pt}
.fim{break-inside:avoid}
"""


def blocos_do_seed(texto):
    """Quebra demoContract.text em (cabeçalho, [(titulo_clausula, [(ref, texto)])])."""
    blocos = texto.split("\n\n")
    cabecalho = blocos[0].split("\n")
    clausulas = []
    for bloco in blocos[1:]:
        linhas = bloco.split("\n")
        itens = []
        for linha in linhas[1:]:
            ref, resto = linha.split(" ", 1)
            itens.append((ref, resto))
        clausulas.append((linhas[0], itens))
    return cabecalho, clausulas


def itens_html(itens):
    return "\n".join(f'<p class="item"><b>{esc(r)}</b>{esc(t)}</p>' for r, t in itens)


def html_contrato(seed):
    texto = seed["demoContract"]["text"]
    (titulo, resumo), clausulas = blocos_do_seed(texto)

    partes = f"""
<h2>QUALIFICAÇÃO DAS PARTES</h2>
<p><b>CONTRATANTE:</b> ROTA SUL LOGÍSTICA LTDA., pessoa jurídica de direito privado fictícia,
inscrita no CNPJ sob o nº <span class="num">{CNPJ_CONTRATANTE}</span> (número fictício), com sede no
município de Canoas/RS, neste ato representada na forma de seu contrato social.</p>
<p><b>CONTRATADA:</b> NUVEMSOFT TECNOLOGIA LTDA., pessoa jurídica de direito privado fictícia,
inscrita no CNPJ sob o nº <span class="num">{CNPJ_CONTRATADA}</span> (número fictício), com sede no
município de Porto Alegre/RS, neste ato representada na forma de seu contrato social.</p>
<p>As partes acima qualificadas celebram o presente contrato, que se regerá pelas cláusulas e
condições seguintes.</p>
<h2>CLÁUSULA 1 · OBJETO</h2>
{itens_html([("1.1", "Fornecimento, pela Contratada à Contratante, de licenças de software em nuvem, "
                     "suporte técnico, implantação e treinamento, nas quantidades, preços e condições "
                     "das cláusulas 2 a 6.")])}
"""

    corpo_clausulas = "\n".join(
        f"<h2>{esc(tit)}</h2>\n{itens_html(itens)}" for tit, itens in clausulas
    )

    finais = """
<h2>CLÁUSULA 7 · DISPOSIÇÕES GERAIS</h2>
""" + itens_html([
        ("7.1", "A Contratante conferirá as quantidades e os valores faturados contra este contrato "
                "e contra os registros de entrega antes de cada pagamento."),
        ("7.2", "Fica eleito o foro da comarca de Canoas/RS para dirimir as questões oriundas "
                "deste contrato."),
    ]) + """
<div class="fim">
<p>E, por estarem de acordo, as partes assinam o presente instrumento em duas vias de igual teor.</p>
<p class="local">Canoas/RS, 25 de agosto de 2026.</p>
<div class="assinaturas">
  <div class="assinatura">ROTA SUL LOGÍSTICA LTDA. · Contratante<small>Representante legal (fictício)</small></div>
  <div class="assinatura">NUVEMSOFT TECNOLOGIA LTDA. · Contratada<small>Representante legal (fictício)</small></div>
  <div class="assinatura">Testemunha 1<small>Nome fictício · demonstração</small></div>
  <div class="assinatura">Testemunha 2<small>Nome fictício · demonstração</small></div>
</div>
</div>
"""

    corpo = f"""
<div class="marca" aria-hidden="true"><span>MODELO FICTÍCIO<br>DEMONSTRAÇÃO</span></div>
<main>
<div class="faixa">MODELO FICTÍCIO · DEMONSTRAÇÃO · SEM VALOR JURÍDICO</div>
<h1>{esc(titulo)}</h1>
<p class="resumo">{esc(resumo)}</p>
{partes}
{corpo_clausulas}
{finais}
</main>"""
    return pagina("Contrato nº 042/2026 (fictício)", CONTRATO_CSS, corpo)


# ---------------------------------------------------------------- NF

NF_CSS = """
@page{size:A4;margin:14mm 14mm 16mm}
body{font-size:9.5pt;line-height:1.35}
.caixa{border:1px solid var(--tinta)}
.grade{display:grid;border:1px solid var(--tinta);border-bottom:0}
.grade>div{border-bottom:1px solid var(--tinta);padding:5px 7px}
.grade>div+div{border-left:1px solid var(--tinta)}
.rot{display:block;font-size:6.8pt;letter-spacing:.06em;text-transform:uppercase;color:var(--fraca);margin-bottom:1px}
.topo{grid-template-columns:1.25fr 1fr 1.35fr}
.topo .emit b{font-size:12pt}
.danfe{text-align:center}
.danfe b{display:block;font-size:13pt;letter-spacing:.06em}
.danfe .num{font-size:10pt}
.chave{font-size:8.6pt;letter-spacing:.02em;word-spacing:.15em}
.semcodigo{margin-top:5px;border:1px dashed var(--filete);color:var(--fraca);text-align:center;
  font-size:7.5pt;padding:7px 2px;letter-spacing:.06em}
.l2{grid-template-columns:2fr 1.3fr}
.l3{grid-template-columns:2fr .9fr .65fr .65fr}
h3{font-size:7.5pt;letter-spacing:.1em;margin:12px 0 4px;font-weight:700}
table{width:100%;border-collapse:collapse;border:1px solid var(--tinta)}
th{font-size:6.8pt;letter-spacing:.06em;text-transform:uppercase;color:var(--fraca);font-weight:600;
  text-align:left;padding:5px 6px;border-bottom:1px solid var(--tinta);background:var(--fundo)}
td{padding:6px;border-bottom:1px solid var(--filete);vertical-align:top}
tr:last-child td{border-bottom:0}
.d{text-align:right;white-space:nowrap}
.c{text-align:center}
.totais{grid-template-columns:1fr 1fr 1fr 1.3fr}
.totais .num{font-size:10.5pt}
.totais .final{background:var(--fundo)}
.totais .final .num{font-size:13pt;font-weight:600}
.adic{min-height:22mm}
"""


def ler_xml():
    r = ET.parse(XML).getroot()
    itens = []
    for d in r.findall("det"):
        p = d.find("prod")
        itens.append({
            "n": int(d.get("nItem")),
            "cod": p.findtext("cProd"),
            "desc": p.findtext("xProd"),
            "un": p.findtext("uCom"),
            "q": float(p.findtext("qCom")),
            "vu": float(p.findtext("vUnCom")),
            "v": float(p.findtext("vProd")),
        })
    t = r.find("total/ICMSTot")
    return {
        "nNF": r.findtext("ide/nNF"),
        "serie": r.findtext("ide/serie"),
        "dhEmi": r.findtext("ide/dhEmi"),
        "comp": r.findtext("ide/competencia"),
        "natOp": r.findtext("ide/natOp"),
        "emit": {k: r.findtext(f"emit/{k}") for k in ("CNPJ", "xNome", "xMun", "UF")},
        "dest": {k: r.findtext(f"dest/{k}") for k in ("CNPJ", "xNome", "xMun", "UF")},
        "itens": itens,
        "vProd": float(t.findtext("vProd")),
        "vDesc": float(t.findtext("vDesc")),
        "vNF": float(t.findtext("vNF")),
        "infCpl": r.findtext("infAdic/infCpl"),
    }


def conferir_nf(nf):
    erros = []
    for it in nf["itens"]:
        if abs(it["q"] * it["vu"] - it["v"]) > 0.005:
            erros.append(f"linha {it['n']}: {it['q']} × {it['vu']} ≠ {it['v']}")
    soma = sum(it["v"] for it in nf["itens"])
    if abs(soma - nf["vProd"]) > 0.005:
        erros.append(f"soma das linhas {soma} ≠ vProd {nf['vProd']}")
    if abs(nf["vProd"] - nf["vDesc"] - nf["vNF"]) > 0.005:
        erros.append(f"vProd − vDesc ≠ vNF ({nf['vProd']} − {nf['vDesc']} ≠ {nf['vNF']})")
    return erros


def data_br(iso):
    a, m, d = iso[:10].split("-")
    return f"{d}/{m}/{a}"


def html_nf(nf):
    chave = " ".join(["0000"] * 11)  # 44 zeros: chave fictícia, não consulta em lugar nenhum
    e, d = nf["emit"], nf["dest"]
    a, m = nf["comp"].split("-")
    linhas = "\n".join(
        f"<tr><td class=\"c num\">{it['n']}</td><td class=\"num\">{esc(it['cod'])}</td>"
        f"<td>{esc(it['desc'])}</td><td>{esc(it['un'])}</td>"
        f"<td class=\"d num\">{qtd(it['q'])}</td><td class=\"d num\">{brl(it['vu'])}</td>"
        f"<td class=\"d num\">{brl(it['v'])}</td></tr>"
        for it in nf["itens"]
    )
    corpo = f"""
<div class="marca" aria-hidden="true"><span>DOCUMENTO FICTÍCIO<br>SEM VALOR FISCAL</span></div>
<main>
<div class="faixa">DOCUMENTO FICTÍCIO · SEM VALOR FISCAL · GERADO PARA DEMONSTRAÇÃO</div>

<div class="grade topo">
  <div class="emit"><span class="rot">Emitente</span><b>{esc(e['xNome'])}</b><br>
    CNPJ fictício<br><span class="num">{esc(e['CNPJ'])}</span><br>{esc(e['xMun'])}/{esc(e['UF'])}</div>
  <div class="danfe"><span class="rot">Documento auxiliar fictício</span><b>DANFE</b>simplificado<br>
    <span class="num">Nº {esc(nf['nNF'])} · Série {esc(nf['serie'])}</span><br>Folha 1/1</div>
  <div><span class="rot">Chave de acesso (fictícia)</span><span class="num chave">{chave}</span>
    <div class="semcodigo">SEM CÓDIGO DE BARRAS</div></div>
</div>
<div class="grade l2">
  <div><span class="rot">Natureza da operação</span>{esc(nf['natOp'])}</div>
  <div><span class="rot">Protocolo de autorização</span>Inexistente · documento fictício</div>
</div>
<div class="grade l3">
  <div><span class="rot">Destinatário</span><b>{esc(d['xNome'])}</b><br>
    CNPJ <span class="num">{esc(d['CNPJ'])}</span> (fictício) · {esc(d['xMun'])}/{esc(d['UF'])}</div>
  <div><span class="rot">Data de emissão</span><span class="num">{data_br(nf['dhEmi'])}</span></div>
  <div><span class="rot">Competência</span><span class="num">{m}/{a}</span></div>
  <div><span class="rot">Contrato</span><span class="num">042/2026</span></div>
</div>

<h3>DADOS DOS PRODUTOS E SERVIÇOS</h3>
<table>
  <thead><tr><th class="c">Nº</th><th>Código</th><th>Descrição</th><th>Un.</th>
    <th class="d">Qtd.</th><th class="d">Valor unit. (R$)</th><th class="d">Valor total (R$)</th></tr></thead>
  <tbody>
{linhas}
  </tbody>
</table>

<h3>CÁLCULO DO TOTAL</h3>
<div class="grade totais">
  <div><span class="rot">Valor dos itens</span><span class="num">R$ {brl(nf['vProd'])}</span></div>
  <div><span class="rot">Descontos</span><span class="num">R$ {brl(nf['vDesc'])}</span></div>
  <div><span class="rot">Impostos</span>Não destacados</div>
  <div class="final"><span class="rot">Valor total da nota</span><span class="num">R$ {brl(nf['vNF'])}</span></div>
</div>

<h3>DADOS ADICIONAIS</h3>
<div class="caixa adic" style="padding:6px 7px">{esc(nf['infCpl'])}</div>
</main>"""
    return pagina(f"NF {nf['nNF']} (fictícia)", NF_CSS, corpo)


# ---------------------------------------------------------------- PDF

RODAPE = (
    '<div style="width:100%;font-family:monospace;font-size:7pt;color:#5b606b;'
    'padding:0 14mm;display:flex;justify-content:space-between">'
    "<span>{rotulo}</span><span>página <span class=\"pageNumber\"></span> de "
    '<span class="totalPages"></span></span></div>'
)


def imprimir(browser, html_path, pdf_path, rotulo):
    page = browser.new_page()
    page.goto(html_path.as_uri(), wait_until="networkidle")
    page.evaluate("document.fonts.ready")
    fontes = page.evaluate(
        "[...document.fonts].filter(f => f.status === 'loaded').map(f => f.family)"
    )
    if not any("Source Serif" in f for f in fontes):
        print(f"  AVISO: Source Serif 4 não carregou em {html_path.name}; caiu no Georgia")
    page.pdf(
        path=str(pdf_path),
        prefer_css_page_size=True,
        print_background=True,
        display_header_footer=True,
        header_template="<div></div>",
        footer_template=RODAPE.format(rotulo=esc(rotulo)),
    )
    page.close()


def normalizar(t):
    return re.sub(r"\s+", " ", t).strip()


def conferir_clausulas(seed, pdf_path):
    texto = normalizar("\n".join(p.extract_text() for p in PdfReader(pdf_path).pages))
    faltando = [c["ref"] for c in seed["demoContract"]["clauses"] if normalizar(c["text"]) not in texto]
    return faltando, texto


def main():
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    nf = ler_xml()

    erros = conferir_nf(nf)
    if erros:
        sys.exit("XML inconsistente:\n  " + "\n  ".join(erros))

    html_c = FONTES / "contrato-042-2026.html"
    html_n = FONTES / "nf-8812.html"
    # newline="\n": no Windows o write_text viraria CRLF e o .txt deixaria de ser igual ao seed
    html_c.write_text(html_contrato(seed), encoding="utf-8", newline="\n")
    html_n.write_text(html_nf(nf), encoding="utf-8", newline="\n")

    PUBLICO.mkdir(parents=True, exist_ok=True)
    pdf_c = PUBLICO / f"{CONTRATO}.pdf"
    pdf_n = PUBLICO / f"{NF}.pdf"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        imprimir(browser, html_c, pdf_c, "Contrato nº 042/2026 · modelo fictício · demonstração")
        imprimir(browser, html_n, pdf_n, f"NF {nf['nNF']} · série {nf['serie']} · documento fictício · sem valor fiscal")
        browser.close()

    txt = PUBLICO / f"{CONTRATO}.txt"
    txt.write_text(seed["demoContract"]["text"] + "\n", encoding="utf-8", newline="\n")

    for arq in (pdf_c, pdf_n, txt):
        shutil.copyfile(arq, DADOS / arq.name)

    faltando, _ = conferir_clausulas(seed, pdf_c)
    total = len(seed["demoContract"]["clauses"])
    if faltando:
        sys.exit(f"Cláusulas que NÃO aparecem literalmente no PDF: {', '.join(faltando)}")
    print(f"ok: {total}/{total} cláusulas do seed aparecem literalmente no PDF do contrato")
    print(f"ok: NF {nf['nNF']} com {len(nf['itens'])} linhas, total R$ {brl(nf['vNF'])}")


if __name__ == "__main__":
    main()
