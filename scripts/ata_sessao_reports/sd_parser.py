from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path

from .models import LotItemData

SD_NUMBER_RE = re.compile(
    r"(?:\bSD\b|N[º°o])\s*[:\-]?\s*(?P<numero>\d{1,4})\s*/\s*(?P<ano>20\d{2})",
    re.IGNORECASE,
)
PROCESSO_ADMIN_RE = re.compile(
    r"PROCESSO\s+ADMINISTRATIVO\s+(?:N[ºo°]\s*)?(?P<processo>[\d./-]+)",
    re.IGNORECASE,
)
DATE_RE = re.compile(r"\b(?P<data>\d{2}/\d{2}/\d{4})\b")
CENTRO_CUSTO_RE = re.compile(
    r"Centro\s+de\s+Custo\s*:\s*(?P<codigo>\d{1,7})\s*-\s*\d+\s*(?P<nome>[A-ZÀ-ÚÇÃÕ\s]+?)(?=\s+ASSUNTO|$)",
    re.IGNORECASE,
)
UNIDADE_ORCAMENTARIA_RE = re.compile(
    r"Unidade\s+Or[cç]ament[áa]ria\s*:?\s*(?P<unidade>[^\n]+)",
    re.IGNORECASE,
)
ELEMENTO_DESPESA_RE = re.compile(r"Elemento\s+da\s+Despesa\s*:?\s*(?P<elemento>[^\n]+)", re.IGNORECASE)
FONTE_RECURSO_RE = re.compile(r"Fonte\s+de\s+Recurso\s*:?\s*(?P<fonte>[^\n]+)", re.IGNORECASE)
ASSUNTO_RE = re.compile(r"ASSUNTO\s*/\s*OBJETO\s+SOLICITADO\s*:\s*(?P<linha>[^\n]*)", re.IGNORECASE)
TOTAL_VALUE_RE = re.compile(r"Valor\s+Total\s*:?\s*(?:R\$\s*)?(?P<valor>[\d\.,]+)", re.IGNORECASE)

ITEM_START_RE = re.compile(r"^(?P<item>\d{1,3})\b")
ITEM_TAIL_RE = re.compile(
    r"(?P<qtd>\d[\d.,]*)\s+"
    r"(?P<per>\d[\d.,]*)\s+"
    r"(?P<unid>[A-Z0-9º°ª²³./-]{1,8})\s+"
    r"(?P<preco>\d[\d.,]*)\s+"
    r"(?P<total>\d[\d.,]*)$",
    re.IGNORECASE,
)
ITEM_HEADER_HINT_RE = re.compile(r"^\s*ITEM\s+CATMAT", re.IGNORECASE)
NON_ITEM_LINE_RE = re.compile(
    r"^(?:Valor\s+Total|Classifica[cç][aã]o\s+Or[cç]ament[áa]ria|"
    r"Centro\s+de\s+Custo|Processo\s+Administrativo|Fonte\s+de\s+Recurso|"
    r"Unidade\s+Or[cç]ament[áa]ria|Elemento\s+da\s+Despesa|Assunto|Justificativa)\b",
    re.IGNORECASE,
)
TABLE_UNIT_RE = r"(?:Und\.|PCT|CX|RL|ROL|FL|m\.|KG|MT|ENV|CJ|FR|Und|UND|UN\b|L\b|UNI|KIT|PC|M3|M2|M\b)"
TABLE_ROW_COMPACT_RE = re.compile(
    r"^(?P<item>\d{3})\s+(?P<catmat>\d{5,12})\s+(?P<descricao>.+?)\s+"
    r"(?P<qtd>[\d\.]+,\d{2})\s+(?P<per>[\d,]+)\s+(?P<unid>" + TABLE_UNIT_RE + r")\s+"
    r"(?P<preco>[\d\.]+,\d{2})\s+(?P<total>[\d\.]+,\d{2})\s*$",
    re.IGNORECASE,
)
TABLE_SKIP_RE = re.compile(
    r"^(ITEM$|OS RECURSOS|CLASSIFICAÇÃO|Valor\s+Total|Lote\s+\d|FUNDO|AVENIDA|"
    r"CNPJ|Teixeira|PREFEITURA|SECRETARIA|Secretário|R\.\s+Dr|Ouro)",
    re.IGNORECASE,
)
CLASSIFICACAO_BLOCO_RE = re.compile(
    r"CLASSIFICA[CÇ][AÃ]O\s+OR[CÇ]AMENT[ÁA]RIA(?P<bloco>.*?)(?=CLASSIFICA[CÇ][AÃ]O\s+OR[CÇ]AMENT[ÁA]RIA|Observa[cç][aã]o|$)",
    re.IGNORECASE | re.DOTALL,
)
CLASS_CODIGO_RE = re.compile(r"C[oó]d\.\s*Reduzido\s*:\s*(?P<v>[^\n]+)", re.IGNORECASE)
CLASS_UNIDADE_RE = re.compile(r"Unidade\s+Or[cç]ament[áa]ria\s*:\s*(?P<v>[^\n]+)", re.IGNORECASE)
CLASS_PROJETO_RE = re.compile(r"Projeto\s*/\s*Atividade\s*:\s*(?P<v>[^\n]+)", re.IGNORECASE)
CLASS_ELEMENTO_RE = re.compile(r"Elemento\s+da\s+Despesa\s*:\s*(?P<v>[^\n]+)", re.IGNORECASE)
CLASS_FONTE_RE = re.compile(r"Fonte\s+de\s+Recurso\s*:\s*(?P<v>[^\n]+)", re.IGNORECASE)
CONT_TAIL_FULL_RE = re.compile(
    r"(?P<qtd>[\d\.]+,\d{2})\s+(?P<per>[\d,]+)\s+(?P<unid>" + TABLE_UNIT_RE + r")\s+(?P<preco>[\d\.]+,\d{2})\s+(?P<total>[\d\.]+,\d{2})\s*$",
    re.IGNORECASE,
)
CONT_TAIL_SHORT_RE = re.compile(
    r"(?P<unid>" + TABLE_UNIT_RE + r")\s+(?P<preco>[\d\.]+,\d{2})\s+(?P<total>[\d\.]+,\d{2})\s*$",
    re.IGNORECASE,
)


class SDParsingError(Exception):
    """Exceção base para erros de parsing de Solicitação de Despesa."""


class SDStructureError(SDParsingError):
    """Estrutura do documento não reconhecida."""


class SDItemExtractionError(SDParsingError):
    """Falha ao extrair itens da SD."""


@dataclass(slots=True)
class SDItem:
    numero: int
    catmat_catser: str | None
    descricao: str
    quantidade: Decimal
    percentual: Decimal
    unidade: str
    preco_unitario: Decimal
    preco_total: Decimal
    raw_line: str = ""


@dataclass(slots=True)
class OrcamentClassification:
    codigo_reduzido: str | None
    unidade_orcamentaria: str | None
    projeto_atividade: str | None
    elemento_despesa: str | None
    fonte_recurso: str | None


@dataclass(slots=True)
class SDMetadata:
    numero_sd: str
    data_emissao: str | None
    centro_custo: str | None
    unidade_orcamentaria: str | None
    elemento_despesa: str | None
    fonte_recurso: str | None
    valor_total: Decimal | None
    assunto_objeto: str | None
    processo_administrativo: str | None = None
    classificacoes_orcamentarias: list[OrcamentClassification] = field(default_factory=list)


@dataclass(slots=True)
class SDRecord:
    source_path: str
    metadata: SDMetadata
    itens: list[SDItem] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    parsing_errors: list[dict[str, str]] = field(default_factory=list)


def _normalize_whitespace(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _parse_decimal_ptbr(value: str | None) -> Decimal | None:
    if value is None:
        return None
    normalized = _normalize_whitespace(value).replace("R$", "").replace("%", "")
    normalized = normalized.replace(".", "").replace(",", ".")
    if not normalized:
        return None
    try:
        return Decimal(normalized)
    except InvalidOperation:
        return None


def extract_text_from_pdf(pdf_path: str | Path) -> str:
    import pdfplumber

    pages: list[str] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text(x_tolerance=2, y_tolerance=3) or ""
            if page_text.strip():
                pages.append(page_text)
    return "\n".join(pages)


def _extract_catmat_descricao(value: str) -> tuple[str | None, str]:
    text = _normalize_whitespace(value)
    match = re.match(r"^(?P<catmat>\d{5,12})\s+(?P<descricao>.*)$", text, re.DOTALL)
    if match:
        return match.group("catmat"), _normalize_whitespace(match.group("descricao"))
    return None, text


def _build_sd_item(
    item_raw: str,
    catmat_raw: str | None,
    descricao_raw: str,
    qtd_raw: str,
    per_raw: str,
    unid_raw: str,
    preco_raw: str,
    total_raw: str,
    raw_line: str,
) -> SDItem | None:
    qtd = _parse_decimal_ptbr(qtd_raw)
    per = _parse_decimal_ptbr(per_raw) or Decimal("0")
    preco = _parse_decimal_ptbr(preco_raw)
    total = _parse_decimal_ptbr(total_raw)
    if qtd is None or preco is None or total is None:
        return None
    return SDItem(
        numero=int(item_raw),
        catmat_catser=_normalize_whitespace(catmat_raw) if catmat_raw else None,
        descricao=_normalize_whitespace(descricao_raw),
        quantidade=qtd,
        percentual=per,
        unidade=_normalize_whitespace(unid_raw).upper(),
        preco_unitario=preco,
        preco_total=total,
        raw_line=raw_line,
    )


def _is_continuation_line(row: list[object], current: dict[str, str | None] | None) -> bool:
    if not current:
        return False
    col0 = _normalize_whitespace(str(row[0] or "")) if row else ""
    if re.fullmatch(r"\d{3}", col0):
        return False
    for col in row[1:4]:
        text = _normalize_whitespace(str(col or ""))
        if text and len(text) > 10 and not re.fullmatch(r"\d{5,12}", text):
            return True
    return False


def _merge_continuation_data(current: dict[str, str | None], row: list[object], pending: list[str]) -> None:
    cells = [_normalize_whitespace(str(col or "")) for col in row]
    joined = _normalize_whitespace(" ".join(cells))

    # Preenche numéricos por posição quando possível
    for idx, field in enumerate(["qtd", "per", "unid", "preco", "total"], start=3):
        if idx < len(cells) and not (current.get(field) or "").strip():
            value = cells[idx]
            if value:
                current[field] = value

    # Fallback por regex de cauda (linha completa)
    full_tail = CONT_TAIL_FULL_RE.search(joined)
    short_tail = CONT_TAIL_SHORT_RE.search(joined) if not full_tail else None
    if full_tail:
        for field in ["qtd", "per", "unid", "preco", "total"]:
            if not (current.get(field) or "").strip():
                current[field] = _normalize_whitespace(full_tail.group(field))
        prefix = _normalize_whitespace(joined[: full_tail.start()])
        if prefix:
            cat, desc = _extract_catmat_descricao(prefix)
            if cat and not current.get("catmat"):
                current["catmat"] = cat
            if desc:
                pending.append(desc)
    elif short_tail:
        for field in ["unid", "preco", "total"]:
            if not (current.get(field) or "").strip():
                current[field] = _normalize_whitespace(short_tail.group(field))
        prefix = _normalize_whitespace(joined[: short_tail.start()])
        if prefix:
            cat, desc = _extract_catmat_descricao(prefix)
            if cat and not current.get("catmat"):
                current["catmat"] = cat
            if desc:
                pending.append(desc)

    # Fallback extra para linhas desalinhadas na quebra de página
    money_cells = [cell for cell in cells if re.fullmatch(r"\d{1,3}(?:\.\d{3})*,\d{2}", cell)]
    if len(money_cells) >= 2:
        if not (current.get("preco") or "").strip():
            current["preco"] = money_cells[-2]
        if not (current.get("total") or "").strip():
            current["total"] = money_cells[-1]

    if not (current.get("unid") or "").strip():
        for cell in cells:
            if re.fullmatch(TABLE_UNIT_RE, cell, re.IGNORECASE):
                current["unid"] = cell
                break

    # Captura descrição em colunas 1/2/0
    for idx in (2, 1, 0):
        if idx < len(cells):
            text = cells[idx]
            if not text or TABLE_SKIP_RE.match(text) or re.fullmatch(r"\d{3}", text):
                continue
            cat, desc = _extract_catmat_descricao(text)
            if cat and not current.get("catmat"):
                current["catmat"] = cat
            if desc and not re.fullmatch(r"[\d\.,]+", desc):
                pending.append(desc)


def _extract_multiline_field(text: str, header_pattern: re.Pattern[str], stop_patterns: list[re.Pattern[str]]) -> str | None:
    match = header_pattern.search(text)
    if not match:
        return None
    lines: list[str] = []
    for raw in text[match.end() :].splitlines():
        normalized = _normalize_whitespace(raw)
        if not normalized:
            continue
        if any(pattern.match(normalized) for pattern in stop_patterns):
            break
        if TABLE_SKIP_RE.match(normalized):
            continue
        lines.append(normalized)
    return " ".join(lines) if lines else None


def _extract_classificacoes(text: str) -> list[OrcamentClassification]:
    blocks: list[OrcamentClassification] = []
    for match in CLASSIFICACAO_BLOCO_RE.finditer(text):
        block = match.group("bloco")
        get_val = lambda regex: _normalize_whitespace(regex.search(block).group("v")) if regex.search(block) else None
        blocks.append(
            OrcamentClassification(
                codigo_reduzido=get_val(CLASS_CODIGO_RE),
                unidade_orcamentaria=get_val(CLASS_UNIDADE_RE),
                projeto_atividade=get_val(CLASS_PROJETO_RE),
                elemento_despesa=get_val(CLASS_ELEMENTO_RE),
                fonte_recurso=get_val(CLASS_FONTE_RE),
            )
        )
    return blocks


def _extract_items_from_table_rows(raw_rows: list[list[object]]) -> tuple[list[SDItem], list[str]]:
    items: list[SDItem] = []
    warnings: list[str] = []
    pending: list[str] = []
    current: dict[str, str | None] | None = None

    def finalize_current() -> None:
        nonlocal current, pending
        if not current:
            pending = []
            return
        if pending:
            current["descricao"] = _normalize_whitespace(f"{current.get('descricao') or ''} {' '.join(pending)}")
            pending = []
        parsed = _build_sd_item(
            item_raw=current["item"] or "",
            catmat_raw=current.get("catmat"),
            descricao_raw=current.get("descricao") or "",
            qtd_raw=current.get("qtd") or "",
            per_raw=current.get("per") or "1,00",
            unid_raw=current.get("unid") or "",
            preco_raw=current.get("preco") or "",
            total_raw=current.get("total") or "",
            raw_line=current.get("raw_line") or "",
        )
        if parsed is None:
            warnings.append(f"Item {current.get('item') or '???'} ignorado por dados incompletos na quebra de página.")
        else:
            items.append(parsed)
        current = None

    for row in raw_rows:
        col0_raw = str(row[0] or "") if row else ""
        col0 = _normalize_whitespace(col0_raw)
        col1 = _normalize_whitespace(str(row[1] or "")) if len(row) > 1 else ""
        col2 = _normalize_whitespace(str(row[2] or "")) if len(row) > 2 else ""

        if (col0 in {"", "ITEM"} and col2 in {"", "DESCRIÇÃO / ESPECIFICAÇÃO"}) or TABLE_SKIP_RE.match(col0) or TABLE_SKIP_RE.match(col2):
            continue

        if re.fullmatch(r"\d{3}", col0):
            finalize_current()
            catmat = col1 if re.fullmatch(r"\d{5,12}", col1) else None
            descricao = re.sub(r"^\d{5,12}\s+", "", col2).strip() if catmat else col2
            if not catmat:
                catmat, descricao = _extract_catmat_descricao(col2)
            current = {
                "item": col0,
                "catmat": catmat,
                "descricao": descricao,
                "qtd": str(row[3] or "") if len(row) > 3 else "",
                "per": str(row[4] or "") if len(row) > 4 else "",
                "unid": str(row[5] or "") if len(row) > 5 else "",
                "preco": str(row[6] or "") if len(row) > 6 else "",
                "total": str(row[7] or "") if len(row) > 7 else "",
                "raw_line": " | ".join(_normalize_whitespace(str(col or "")) for col in row),
            }
            pending = []
            continue

        split_lines = [line.strip() for line in col0_raw.splitlines() if line.strip()]
        compact_match = TABLE_ROW_COMPACT_RE.match(split_lines[0]) if split_lines else None
        if compact_match:
            finalize_current()
            descricao = _normalize_whitespace(compact_match.group("descricao"))
            if len(split_lines) > 1:
                descricao = _normalize_whitespace(f"{descricao} {' '.join(split_lines[1:])}")
            parsed = _build_sd_item(
                item_raw=compact_match.group("item"),
                catmat_raw=compact_match.group("catmat"),
                descricao_raw=descricao,
                qtd_raw=compact_match.group("qtd"),
                per_raw=compact_match.group("per"),
                unid_raw=compact_match.group("unid"),
                preco_raw=compact_match.group("preco"),
                total_raw=compact_match.group("total"),
                raw_line=_normalize_whitespace(col0_raw),
            )
            if parsed is None:
                warnings.append(f"Item {compact_match.group('item')} ignorado por números inválidos no formato compacto.")
            else:
                items.append(parsed)
            pending = []
            continue

        if current and _is_continuation_line(row, current):
            _merge_continuation_data(current, list(row), pending)
            continue
        if current:
            _merge_continuation_data(current, list(row), pending)

    finalize_current()

    return items, warnings


def _extract_items_from_pdf_tables(pdf_path: str | Path) -> tuple[list[SDItem], list[str]]:
    import pdfplumber

    raw_rows: list[list[object]] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                has_items = any(
                    row and row[0] and re.match(r"^\d{3}$", _normalize_whitespace(str(row[0])))
                    for row in table
                    if row
                )
                has_header = any(
                    row and _normalize_whitespace(str(row[0] or "")).upper() == "ITEM"
                    for row in table
                    if row
                )
                if has_items or has_header:
                    for row in table:
                        if row and any(str(cell or "").strip() for cell in row):
                            raw_rows.append(list(row))
    return _extract_items_from_table_rows(raw_rows)


def _build_item_blocks(text: str) -> list[str]:
    blocks: list[str] = []
    current_lines: list[str] = []

    for raw_line in text.splitlines():
        line = _normalize_whitespace(raw_line)
        if not line:
            continue
        if ITEM_HEADER_HINT_RE.search(line):
            continue
        if NON_ITEM_LINE_RE.match(line):
            if current_lines:
                blocks.append(" ".join(current_lines))
                current_lines = []
            continue

        if ITEM_START_RE.match(line):
            if current_lines:
                blocks.append(" ".join(current_lines))
            current_lines = [line]
            continue

        if current_lines:
            current_lines.append(line)

    if current_lines:
        blocks.append(" ".join(current_lines))

    return blocks


def _extract_item_from_block(block: str) -> SDItem | str | None:
    tail_match = ITEM_TAIL_RE.search(block)
    if not tail_match:
        return f"Bloco de item sem colunas finais reconhecíveis: {block[:120]}..."

    prefix = _normalize_whitespace(block[: tail_match.start()])
    start_match = ITEM_START_RE.match(prefix)
    if not start_match:
        return f"Bloco de item sem número inicial: {block[:120]}..."

    item_num = int(start_match.group("item"))
    rest = _normalize_whitespace(prefix[start_match.end() :])
    if not rest:
        return f"Item {item_num:03d} sem descrição."

    catmat_catser: str | None = None
    token, _, rem = rest.partition(" ")
    if token and rem and re.fullmatch(r"\d{6,}(?:/\d+)?", token):
        catmat_catser = token
        descricao = _normalize_whitespace(rem)
    else:
        descricao = rest

    qtd = _parse_decimal_ptbr(tail_match.group("qtd"))
    per = _parse_decimal_ptbr(tail_match.group("per")) or Decimal("0")
    preco = _parse_decimal_ptbr(tail_match.group("preco"))
    total = _parse_decimal_ptbr(tail_match.group("total"))
    if qtd is None or preco is None or total is None:
        return f"Item {item_num:03d} ignorado por número inválido."

    return SDItem(
        numero=item_num,
        catmat_catser=catmat_catser,
        descricao=descricao,
        quantidade=qtd,
        percentual=per,
        unidade=_normalize_whitespace(tail_match.group("unid")).upper(),
        preco_unitario=preco,
        preco_total=total,
        raw_line=block,
    )


def _extract_items(text: str) -> tuple[list[SDItem], list[str]]:
    items: list[SDItem] = []
    warnings: list[str] = []
    for block in _build_item_blocks(text):
        parsed = _extract_item_from_block(block)
        if isinstance(parsed, str):
            warnings.append(parsed)
            continue
        if parsed is None:
            continue
        if len(parsed.descricao) < 10:
            warnings.append(f"Item {parsed.numero:03d} com descrição curta para revisão manual.")
        items.append(parsed)

    return items, warnings


def _extract_metadata(text: str) -> SDMetadata:
    number_match = SD_NUMBER_RE.search(text)
    if not number_match:
        raise SDStructureError("Número da SD não identificado no documento.")

    numero_sd = f"{number_match.group('numero')}/{number_match.group('ano')}"

    date_match = DATE_RE.search(text)
    centro_match = CENTRO_CUSTO_RE.search(text)
    unidade_match = UNIDADE_ORCAMENTARIA_RE.search(text)
    elemento_match = ELEMENTO_DESPESA_RE.search(text)
    fonte_match = FONTE_RECURSO_RE.search(text)
    assunto_match = ASSUNTO_RE.search(text)
    processo_match = PROCESSO_ADMIN_RE.search(text)
    total_match = TOTAL_VALUE_RE.search(text)

    assunto_objeto = _extract_multiline_field(
        text,
        ASSUNTO_RE,
        stop_patterns=[
            re.compile(r"^JUSTIFICATIVA\b", re.IGNORECASE),
            re.compile(r"^\s*ITEM\s+CATMAT", re.IGNORECASE),
            re.compile(r"^CLASSIFICA[CÇ][AÃ]O\s+OR[CÇ]AMENT[ÁA]RIA", re.IGNORECASE),
            re.compile(r"^OS\s+RECURSOS", re.IGNORECASE),
        ],
    )
    if assunto_objeto and re.search(r"Teixeira\s+de\s+Freitas.*\d{2}/\d{2}/\d{4}", assunto_objeto, re.IGNORECASE):
        assunto_objeto = None

    processo_administrativo = _normalize_whitespace(processo_match.group("processo")) if processo_match else numero_sd
    classificacoes = _extract_classificacoes(text)

    return SDMetadata(
        numero_sd=numero_sd,
        data_emissao=date_match.group("data") if date_match else None,
        centro_custo=(
            f"{centro_match.group('codigo')} - {_normalize_whitespace(centro_match.group('nome'))}"
            if centro_match
            else None
        ),
        unidade_orcamentaria=_normalize_whitespace(unidade_match.group("unidade")) if unidade_match else None,
        elemento_despesa=_normalize_whitespace(elemento_match.group("elemento")) if elemento_match else None,
        fonte_recurso=_normalize_whitespace(fonte_match.group("fonte")) if fonte_match else None,
        valor_total=_parse_decimal_ptbr(total_match.group("valor")) if total_match else None,
        assunto_objeto=assunto_objeto,
        processo_administrativo=processo_administrativo,
        classificacoes_orcamentarias=classificacoes,
    )


def _build_record(
    source_path: str,
    metadata: SDMetadata,
    items: list[SDItem],
    warnings: list[str],
    logger: logging.Logger,
) -> SDRecord:
    if not items:
        raise SDItemExtractionError("Nenhum item foi extraído da SD.")

    total_items = sum((item.preco_total for item in items), start=Decimal("0"))
    if metadata.valor_total is not None and metadata.valor_total > 0:
        delta = abs(total_items - metadata.valor_total) / metadata.valor_total
        if delta > Decimal("0.01"):
            warnings.append(
                "Valor total divergente (>1%): "
                f"itens={total_items:.2f} vs documento={metadata.valor_total:.2f}"
            )

    for warning in warnings:
        logger.warning("[sd_parser] %s", warning)

    return SDRecord(source_path=source_path, metadata=metadata, itens=items, warnings=warnings)


def parse_sd_text(text: str, source_path: str = "<text>", logger: logging.Logger | None = None) -> SDRecord:
    logger = logger or logging.getLogger(__name__)
    metadata = _extract_metadata(text)
    items, item_warnings = _extract_items(text)
    return _build_record(source_path=source_path, metadata=metadata, items=items, warnings=list(item_warnings), logger=logger)


def parse_sd_pdf(pdf_path: str | Path, logger: logging.Logger | None = None) -> SDRecord:
    logger = logger or logging.getLogger(__name__)
    text = extract_text_from_pdf(pdf_path)
    if not _normalize_whitespace(text):
        raise SDStructureError(
            "PDF sem camada de texto detectável. Gere um PDF pesquisável (OCR) e tente novamente."
        )
    metadata = _extract_metadata(text)
    table_items, table_warnings = _extract_items_from_pdf_tables(pdf_path)
    if table_items:
        return _build_record(
            source_path=str(pdf_path),
            metadata=metadata,
            items=table_items,
            warnings=list(table_warnings),
            logger=logger,
        )

    text_items, text_warnings = _extract_items(text)
    warnings = list(table_warnings) + list(text_warnings)
    return _build_record(
        source_path=str(pdf_path),
        metadata=metadata,
        items=text_items,
        warnings=warnings,
        logger=logger,
    )


def map_sd_item_to_lot_item(sd_item: SDItem) -> LotItemData:
    return LotItemData(
        item_numero=str(sd_item.numero).zfill(3),
        unidade=sd_item.unidade,
        descricao=sd_item.descricao,
        quantidade=float(sd_item.quantidade),
        valor_unitario=float(sd_item.preco_unitario),
        valor_total=float(sd_item.preco_total),
        valor_unitario_estimado=float(sd_item.preco_unitario),
        marca=None,
        modelo=None,
    )
