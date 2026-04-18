from __future__ import annotations

import json
import logging
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Iterable

import pdfplumber

from .models import AtaSessaoParseResult, LotItemData, LotParticipant, LotRecord, MovimentoLote, is_malsucedido_status

# Regex corrigidas (removidos espaços antes das aspas)
KNOWN_LOT_STATUSES = (
    "ADJUDICADO",
    "FRACASSADO",
    "DESERTO",
    "CANCELADO",
    "HABILITAÇÃO",
    "HABILITACAO",
    "HABILITA",
)
LOT_HEADER_RE = re.compile(
    r"^LOTE\s+0*(?P<numero>\d+)\s*-\s*(?P<status>"
    + "|".join(KNOWN_LOT_STATUSES)
    + r")\s*$",
    re.IGNORECASE | re.MULTILINE,
)
LOT_TITLE_RE = re.compile(
    r"^LOTE\s+0*(?P<numero>\d+)\s*-\s*(?P<titulo>.+?)\s*$",
    re.IGNORECASE,
)
SECTION_HEADER_RE = re.compile(r"^Razão Social\s+Num\s+Documento\s+Oferta Inicial\s+Oferta Final\s+Dif.(%)?\s*ME$", re.IGNORECASE)
EDITAL_RE = re.compile(r"(?P<label>PREG[ÃA]O\s+ELETR[ÔO]NICO|DISPENSA(?:\s+ELETR[ÔO]NICA)?)\s+N[ºo°]\s*(?P<edital>[A-Z0-9./-]+)", re.IGNORECASE)
PROCESSO_ADMIN_RE = re.compile(r"PROCESSO\s+ADMINISTRATIVO\s+N[ºo°]\s*(?P<processo>[A-Z0-9./-]+)", re.IGNORECASE)

PARTICIPANT_ROW_RE = re.compile(
    r"^(?:(?P<ranking>\d+)\s+)?"
    r"(?P<razao>.+?)\s+"
    r"(?P<num>\d{1,4})\s+"
    r"(?P<documento>(?:\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})|(?:\d{3}\.\d{3}\.\d{3}-\d{2})|(?:\d{11,14}))\s+"
    r"(?P<oferta_inicial>[\d.,]+)\s+"
    r"(?P<oferta_final>[\d.,]+)"
    r"(?:\s+(?P<diferenca>[\d.,-]+))?\s+"
    r"(?P<me>Sim|N[aã]o)$",
    re.IGNORECASE,
)

MOVIMENTO_RE = re.compile(r"^(?P<data>\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}:\d{2})\s+(?P<body>.+)$")
REFERENCE_VALUE_RE = re.compile(r"valor de refer[êe]ncia para o LOTE é de R\$(?P<valor>[\d.,]+)", re.IGNORECASE)
REASON_RE = re.compile(r"Motivo:\s*(?P<motivo>.+)$", re.IGNORECASE)

SECTION_TITLES = ("CLASSIFICAÇÃO", "DESCLASSIFICADOS", "INABILITADOS", "MOVIMENTOS DO LOTE")


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value or " ").strip()


def normalize_status(value: str | None) -> str:
    status = normalize_whitespace(value).upper()
    if status.startswith("HABILITA"):
        return "HABILITAÇÃO"
    return status


def parse_brazilian_number(value: str | None) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = text.replace("R$", "").replace("%", "").replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def sanitize_text_block(text: str) -> str:
    lines: list[str] = []
    for raw_line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("Gerado em:"):
            continue
        if line == "MUNICIPIO DE TEIXEIRA DE FREITAS":
            continue
        if line == "TEIXEIRA DE FREITAS-BA":
            continue
        lines.append(line)
    return "\n".join(lines)


def extract_text_from_pdf(pdf_path: Path) -> str:
    pages: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text(x_tolerance=2, y_tolerance=3) or ""
            cleaned = sanitize_text_block(page_text)
            if cleaned:
                pages.append(cleaned)
    return "\n".join(pages)


def split_lot_blocks(text: str) -> list[str]:
    matches = list(LOT_HEADER_RE.finditer(text))
    blocks: list[str] = []

    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[start:end].strip()
        if block:
            blocks.append(block)

    return blocks


def extract_header_metadata(text: str) -> tuple[str | None, str | None]:
    edital_match = EDITAL_RE.search(text)
    processo_match = PROCESSO_ADMIN_RE.search(text)
    edital = None
    processo_administrativo = None
    if edital_match:
        label = normalize_whitespace(edital_match.group("label"))
        numero = normalize_whitespace(edital_match.group("edital"))
        edital = f"{label.title()} Nº {numero}"
    if processo_match:
        processo_administrativo = normalize_whitespace(processo_match.group("processo"))
    return edital, processo_administrativo


def extract_section(block: str, start_marker: str, end_markers: Iterable[str]) -> str:
    start_index = block.find(start_marker)
    if start_index < 0:
        return ""
    start_index += len(start_marker)
    end_index = len(block)
    for marker in end_markers:
        marker_index = block.find(marker, start_index)
        if marker_index >= 0:
            end_index = min(end_index, marker_index)
    return block[start_index:end_index].strip()


def parse_status(block: str) -> tuple[int, str, str]:
    match = LOT_HEADER_RE.search(block)
    if not match:
        raise ValueError("Cabeçalho do lote não encontrado.")
    numero = int(match.group("numero"))
    status = normalize_status(match.group("status"))
    titulo_bruto = block[match.end():].split("VALORES UNITÁRIOS FINAIS", 1)[0]
    titulo_linhas = [
        normalize_whitespace(line)
        for line in titulo_bruto.splitlines()
        if normalize_whitespace(line)
    ]
    titulo_normalizado: list[str] = []

    for line in titulo_linhas:
        title_match = LOT_TITLE_RE.match(line)
        if title_match and int(title_match.group("numero")) == numero:
            titulo_normalizado.append(normalize_whitespace(title_match.group("titulo")))
        else:
            titulo_normalizado.append(line)

    titulo = normalize_whitespace(" ".join(titulo_normalizado))
    return numero, status, titulo


def parse_item_section(block: str, logger: logging.Logger) -> list[LotItemData]:
    """Extrai TODOS os itens de um lote."""
    item_block = extract_section(block, "VALORES UNITÁRIOS FINAIS", SECTION_TITLES)
    if not item_block:
        logger.warning("Bloco de valores unitários finais ausente no lote.")
        return []

    itens: list[LotItemData] = []
    
    # Divide o bloco por "Item: " para processar cada um separadamente
    parts = re.split(r"(?=Item:\s*\d+)", item_block, flags=re.IGNORECASE)
    
    for part in parts:
        if not part.strip():
            continue
            
        item = LotItemData()
        
        # Extração do número e unidade
        header_match = re.search(
            r"Item:\s*(?P<item>\d+)\s+Unidade:\s*(?P<unidade>[^\n]+?)\s+Marca:\s*(?P<marca>.*?)\s+Modelo:\s*(?P<modelo>.*?)(?:\n|Descrição:)",
            part,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if header_match:
            item.item_numero = normalize_whitespace(header_match.group("item"))
            item.unidade = normalize_whitespace(header_match.group("unidade"))
            item.marca = normalize_whitespace(header_match.group("marca")) or None
            item.modelo = normalize_whitespace(header_match.group("modelo")) or None

        # Extração de descrição e valores
        desc_match = re.search(
            r"Descrição:\s*(?P<descricao>.*?)\s+Quantidade:\s*(?P<quantidade>[\d\.,]+)\s+Valor Unit\.:\s*(?P<valor_unitario>[\d\.,]+)\s+Valor Total:\s*(?P<valor_total>[\d\.,]+)",
            part,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if desc_match:
            item.descricao = normalize_whitespace(desc_match.group("descricao"))
            item.quantidade = parse_brazilian_number(desc_match.group("quantidade"))
            item.valor_unitario = parse_brazilian_number(desc_match.group("valor_unitario"))
            item.valor_total = parse_brazilian_number(desc_match.group("valor_total"))
        else:
            logger.warning("Não foi possível extrair descrição/quantidade/valores do item.")

        # Só adiciona se tiver número ou descrição
        if item.item_numero or item.descricao:
            itens.append(item)

    return itens


def parse_participant_row(raw_line: str) -> LotParticipant | None:
    normalized = normalize_whitespace(raw_line)
    match = PARTICIPANT_ROW_RE.match(normalized)
    if not match:
        return None
    me_raw = normalize_whitespace(match.group("me")).lower()
    return LotParticipant(
        section="",
        ranking=int(match.group("ranking")) if match.group("ranking") else None,
        participante_numero=match.group("num"),
        razao_social=normalize_whitespace(match.group("razao")),
        documento=match.group("documento"),
        oferta_inicial=parse_brazilian_number(match.group("oferta_inicial")),
        oferta_final=parse_brazilian_number(match.group("oferta_final")),
        diferenca_percentual=parse_brazilian_number(match.group("diferenca")),
        me_epp=True if me_raw == "sim" else False if me_raw in {"nao", "não"} else None,
        raw_line=normalized,
    )


def parse_section_participants(section_name: str, section_text: str, logger: logging.Logger, warnings: list[str]) -> list[LotParticipant]:
    if not section_text:
        return []
    rows: list[LotParticipant] = []
    buffer = ""
    
    # Keywords para identificar e pular a linha de cabeçalho da tabela
    HEADER_KEYWORDS = {"Razão Social", "Num", "Documento", "Oferta Inicial", "Oferta Final"}

    for raw_line in section_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        
        # Pula explicitamente o cabeçalho da tabela
        if SECTION_HEADER_RE.match(line) or all(kw in line for kw in HEADER_KEYWORDS):
            continue

        if (
            not buffer
            and rows
            and not re.search(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11,14}", line)
            and not re.search(r"[\d]+\,[\d]{2}", line)
        ):
            rows[-1].razao_social = normalize_whitespace(f"{rows[-1].razao_social} {line}")
            rows[-1].raw_line = normalize_whitespace(f"{rows[-1].raw_line} {line}")
            continue

        buffer = f"{buffer} {line}".strip() if buffer else line
        if re.search(r"\b(Sim|N[aã]o)\s*$", buffer, re.IGNORECASE):
            participant = parse_participant_row(buffer)
            if participant:
                participant.section = section_name
                rows.append(participant)
            else:
                message = f"Linha de participante não reconhecida em {section_name}: {buffer}"
                warnings.append(message)
                logger.warning(message)
            buffer = ""

    if buffer:
        participant = parse_participant_row(buffer)
        if participant:
            participant.section = section_name
            rows.append(participant)
        else:
            message = f"Linha residual de participante não reconhecida em {section_name}: {buffer}"
            warnings.append(message)
            logger.warning(message)

    return rows

def fallback_participants_from_movements(movimentos: list[MovimentoLote], known: list[LotParticipant]) -> list[LotParticipant]:
    if known:
        known_keys = {(item.participante_numero, item.documento, item.razao_social) for item in known}
    else:
        known_keys = set()

    rows: list[LotParticipant] = []
    for movimento in movimentos:
        match = re.search(
            r"LANCE\s+(?P<razao>.+?)\s+\(PARTICIPANTE\s+(?P<num>\d+)\)\s+(?P<valor>[\d\.,]+)$",
            movimento.raw_text,
            flags=re.IGNORECASE,
        )
        if not match:
            continue
        key = (match.group("num"), None, normalize_whitespace(match.group("razao")))
        if key in known_keys:
            continue
        rows.append(
            LotParticipant(
                section="MOVIMENTOS",
                ranking=None,
                participante_numero=match.group("num"),
                razao_social=normalize_whitespace(match.group("razao")),
                documento=None,
                oferta_inicial=parse_brazilian_number(match.group("valor")),
                oferta_final=None,
                diferenca_percentual=None,
                me_epp=None,
                raw_line=movimento.raw_text,
            ),
        )
        known_keys.add(key)
    return rows


def parse_movements(block: str) -> list[MovimentoLote]:
    section_text = extract_section(block, "MOVIMENTOS DO LOTE", ["LOTE "])
    if not section_text:
        return []
    movements: list[MovimentoLote] = []
    current: str | None = None
    for raw_line in section_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if MOVIMENTO_RE.match(line):
            if current:
                movements.append(_build_movement(current))
            current = line
        elif current:
            current = f"{current} {line}"
    if current:
        movements.append(_build_movement(current))
    return movements


def _build_movement(raw_text: str) -> MovimentoLote:
    match = MOVIMENTO_RE.match(raw_text)
    if not match:
        return MovimentoLote(timestamp="", evento="", detalhe=normalize_whitespace(raw_text), raw_text=normalize_whitespace(raw_text))
    body = normalize_whitespace(match.group("body"))
    evento = body
    detalhe = ""
    if " Motivo: " in body:
        evento = normalize_whitespace(body.split(" Motivo: ", 1)[0])
        detalhe = normalize_whitespace(body.split(" Motivo: ", 1)[1])
    elif " PARA PARTICIPANTE " in body:
        evento = normalize_whitespace(body.split(": ", 1)[0])
        detalhe = normalize_whitespace(body.split(": ", 1)[1]) if ": " in body else ""
    elif re.search(r"\b(PREGOEIRO|SISTEMA|PARTICIPANTE)\b", body):
        tokens = body.split("  ", 3)
        if len(tokens) >= 3:
            evento = "  ".join(tokens[:min(3, len(tokens))])
            detalhe = normalize_whitespace(body[len(evento):])
    return MovimentoLote(
        timestamp=match.group("data"),
        evento=evento,
        detalhe=detalhe,
        raw_text=normalize_whitespace(raw_text),
    )


def parse_failure_reason(lot: LotRecord) -> str | None:
    reasons: list[str] = []
    for movement in lot.movimentos:
        reason_match = REASON_RE.search(movement.raw_text)
        if reason_match:
            reasons.append(normalize_whitespace(reason_match.group("motivo")))
            continue
        lowered = movement.raw_text.lower()
        if "erro técnico" in lowered or "erro tecnico" in lowered:
            reasons.append(normalize_whitespace(movement.raw_text))
    unique_reasons = list(dict.fromkeys(filter(None, reasons)))
    if unique_reasons:
        return " | ".join(unique_reasons)
    if lot.status == "DESERTO":
        return "Lote sem participantes ou sem propostas válidas na sessão."
    if lot.status == "CANCELADO":
        return "Lote cancelado durante a sessão."
    if lot.status == "FRACASSADO":
        return "Lote encerrado sem proposta válida adjudicável."
    return None


def apply_estimated_value_from_movements(lot: LotRecord) -> None:
    if not lot.itens:
        return
    for movement in lot.movimentos:
        match = REFERENCE_VALUE_RE.search(movement.raw_text)
        if not match:
            continue
        valor_total = parse_brazilian_number(match.group("valor"))
        if valor_total is None:
            continue
        
        # Aplica ao primeiro item (ou divide se necessário, mas aqui assume referência ao lote)
        # Se quiser distribuir, teria que mudar a lógica. 
        # Mantendo simples: atualiza o primeiro item se existir.
        if lot.itens[0].quantidade and lot.itens[0].quantidade > 0:
            lot.itens[0].valor_unitario_estimado = valor_total / lot.itens[0].quantidade
        else:
            lot.itens[0].valor_unitario_estimado = valor_total
        return
    
    if lot.itens[0].valor_unitario and lot.itens[0].valor_unitario > 0:
        lot.itens[0].valor_unitario_estimado = lot.itens[0].valor_unitario


def resolve_winner(lot: LotRecord) -> None:
    classificados = [item for item in lot.participantes if item.section == "CLASSIFICACAO"]
    if not classificados:
        return
    winner = min(
        classificados,
        key=lambda item: (
            item.ranking if item.ranking is not None else 9999,
            item.oferta_final if item.oferta_final is not None else float("inf"),
        ),
    )
    lot.vencedor = winner.razao_social
    lot.cnpj_vencedor = winner.documento
    lot.melhor_lance = winner.oferta_final


def parse_lot_block(block: str, logger: logging.Logger) -> LotRecord:
    numero_lote, status, titulo = parse_status(block)
    lot = LotRecord(numero_lote=numero_lote, status=status, titulo=titulo)
    lot.itens = parse_item_section(block, logger)  # Agora retorna lista
    warnings: list[str] = []
    classificacao_text = extract_section(block, "CLASSIFICAÇÃO", ("DESCLASSIFICADOS", "INABILITADOS", "MOVIMENTOS DO LOTE"))
    desclassificados_text = extract_section(block, "DESCLASSIFICADOS", ("INABILITADOS", "MOVIMENTOS DO LOTE"))
    inabilitados_text = extract_section(block, "INABILITADOS", ("MOVIMENTOS DO LOTE",))

    lot.participantes.extend(parse_section_participants("CLASSIFICACAO", classificacao_text, logger, warnings))
    lot.participantes.extend(parse_section_participants("DESCLASSIFICADOS", desclassificados_text, logger, warnings))
    lot.participantes.extend(parse_section_participants("INABILITADOS", inabilitados_text, logger, warnings))
    lot.movimentos = parse_movements(block)
    lot.participantes.extend(fallback_participants_from_movements(lot.movimentos, lot.participantes))
    apply_estimated_value_from_movements(lot)
    resolve_winner(lot)
    if is_malsucedido_status(lot.status):
        lot.motivo_falha = parse_failure_reason(lot)
    lot.warnings.extend(warnings)
    return lot


def parse_ata_sessao_pdf(pdf_path: str | Path, logger: logging.Logger | None = None, parsing_error_log_path: str | Path | None = None) -> AtaSessaoParseResult:
    pdf_path = Path(pdf_path).resolve()
    logger = logger or logging.getLogger("ata_sessao_reports")
    text = extract_text_from_pdf(pdf_path)
    blocks = split_lot_blocks(text)
    result = AtaSessaoParseResult(
        source_path=str(pdf_path),
        generated_at=datetime.now().isoformat(),
    )
    result.edital, result.processo_administrativo = extract_header_metadata(text)
    parsing_error_file = Path(parsing_error_log_path) if parsing_error_log_path else None
    if parsing_error_file:
        parsing_error_file.parent.mkdir(parents=True, exist_ok=True)
        parsing_error_file.write_text("", encoding="utf-8")

    for block in blocks:
        try:
            lot = parse_lot_block(block, logger)
            result.lotes.append(lot)
            result.warnings.extend(lot.warnings)
        except Exception as exc:  # noqa: BLE001
            header = LOT_HEADER_RE.search(block)
            lote = header.group("numero") if header else "desconhecido"
            message = f"Falha ao processar lote {lote}: {exc}"
            logger.exception(message)
            result.warnings.append(message)
            payload = {"lote": str(lote), "erro": str(exc), "bloco": block[:20000]}
            result.parsing_errors.append(payload)
            if parsing_error_file:
                with parsing_error_file.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(payload, ensure_ascii=False, indent=2))
                    handle.write("\n\n")

    result.lotes.sort(key=lambda lot: lot.numero_lote)
    return result


def normalize_ascii_slug(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    normalized = re.sub(r"[^a-zA-Z0-9._-]+", "-", normalized)
    normalized = re.sub(r"-+", "-", normalized).strip("-")
    return normalized.lower() or "arquivo"
