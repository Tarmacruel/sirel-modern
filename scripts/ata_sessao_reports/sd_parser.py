from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path

import pdfplumber

from .models import LotItemData

SD_NUMBER_RE = re.compile(r"(?:\bSD\s+)?(?P<numero>\d{1,4})\s*/\s*(?P<ano>\d{4})", re.IGNORECASE)
PROCESSO_ADMIN_RE = re.compile(
    r"PROCESSO\s+ADMINISTRATIVO\s+(?:N[ºo°]\s*)?(?P<processo>[\d./-]+)",
    re.IGNORECASE,
)
DATE_RE = re.compile(r"\b(?P<data>\d{2}/\d{2}/\d{4})\b")
CENTRO_CUSTO_RE = re.compile(r"\b(?P<codigo>\d{6,8})\s*-\s*(?P<nome>[A-ZÀ-Ú\s]+)", re.IGNORECASE)
UNIDADE_ORCAMENTARIA_RE = re.compile(
    r"Unidade\s+Or[cç]ament[áa]ria\s*:?\s*(?P<unidade>[^\n]+)",
    re.IGNORECASE,
)
ELEMENTO_DESPESA_RE = re.compile(r"Elemento\s+da\s+Despesa\s*:?\s*(?P<elemento>[^\n]+)", re.IGNORECASE)
FONTE_RECURSO_RE = re.compile(r"Fonte\s+de\s+Recurso\s*:?\s*(?P<fonte>[^\n]+)", re.IGNORECASE)
ASSUNTO_RE = re.compile(r"Assunto\s*:?\s*(?P<assunto>[^\n]+)", re.IGNORECASE)
TOTAL_VALUE_RE = re.compile(r"Valor\s+Total\s*:?\s*R\$\s*(?P<valor>[\d.,]+)", re.IGNORECASE)

ITEM_ROW_RE = re.compile(
    r"^(?P<item>\d{1,3})\s+"
    r"(?:(?P<catmat>\d{3,}(?:/\d+)?)\s+)?"
    r"(?P<descricao>.+?)\s+"
    r"(?P<qtd>\d[\d.,]*)\s+"
    r"(?P<per>\d[\d.,]*)\s+"
    r"(?P<unid>[A-Z]{2,5})\s+"
    r"(?P<preco>\d[\d.,]*)\s+"
    r"(?P<total>\d[\d.,]*)$",
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
    pages: list[str] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text(x_tolerance=2, y_tolerance=3) or ""
            if page_text.strip():
                pages.append(page_text)
    return "\n".join(pages)


def _extract_items(text: str) -> tuple[list[SDItem], list[str]]:
    items: list[SDItem] = []
    warnings: list[str] = []

    for raw_line in text.splitlines():
        line = _normalize_whitespace(raw_line)
        if not line:
            continue
        match = ITEM_ROW_RE.match(line)
        if not match:
            continue

        qtd = _parse_decimal_ptbr(match.group("qtd"))
        per = _parse_decimal_ptbr(match.group("per")) or Decimal("0")
        preco = _parse_decimal_ptbr(match.group("preco"))
        total = _parse_decimal_ptbr(match.group("total"))
        if qtd is None or preco is None or total is None:
            warnings.append(f"Linha ignorada por número inválido: {line}")
            continue

        descricao = _normalize_whitespace(match.group("descricao"))
        if len(descricao) < 10:
            warnings.append(f"Item {match.group('item')} com descrição curta para revisão manual.")

        items.append(
            SDItem(
                numero=int(match.group("item")),
                catmat_catser=_normalize_whitespace(match.group("catmat")) or None,
                descricao=descricao,
                quantidade=qtd,
                percentual=per,
                unidade=_normalize_whitespace(match.group("unid")).upper(),
                preco_unitario=preco,
                preco_total=total,
                raw_line=line,
            )
        )

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
        assunto_objeto=_normalize_whitespace(assunto_match.group("assunto")) if assunto_match else None,
        processo_administrativo=_normalize_whitespace(processo_match.group("processo")) if processo_match else None,
    )


def parse_sd_text(text: str, source_path: str = "<text>", logger: logging.Logger | None = None) -> SDRecord:
    logger = logger or logging.getLogger(__name__)
    metadata = _extract_metadata(text)
    items, item_warnings = _extract_items(text)

    if not items:
        raise SDItemExtractionError("Nenhum item foi extraído da SD.")

    warnings = list(item_warnings)
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


def parse_sd_pdf(pdf_path: str | Path, logger: logging.Logger | None = None) -> SDRecord:
    text = extract_text_from_pdf(pdf_path)
    return parse_sd_text(text=text, source_path=str(pdf_path), logger=logger)


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
