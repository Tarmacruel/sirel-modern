from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal

from .models import AtaSessaoParseResult, LotParticipant, LotRecord

DisplaySection = Literal['CLASSIFICACAO', 'DESCLASSIFICADOS', 'INABILITADOS', 'MOVIMENTOS']

SECTION_LABELS: dict[str, str] = {
    'CLASSIFICACAO': 'Classificação',
    'DESCLASSIFICADOS': 'Desclassificados',
    'INABILITADOS': 'Inabilitados',
    'MOVIMENTOS': 'Participantes detectados nos movimentos',
}

MALSUCEDIDO_STATUSES = {'FRACASSADO', 'DESERTO', 'CANCELADO'}


@dataclass(slots=True)
class ReportHeaderMetadata:
    arquivo_origem: str
    data_geracao: str
    edital: str | None
    processo_administrativo: str | None


@dataclass(slots=True)
class NormalizedParticipant:
    section: DisplaySection
    section_label: str
    ranking: int | None
    participante_numero: str | None
    razao_social: str
    documento: str | None
    oferta_inicial: float | None
    oferta_final: float | None
    oferta_registrada: float | None
    diferenca_percentual: float | None
    me_epp: bool | None


@dataclass(slots=True)
class NormalizedLot:
    numero_lote: int
    status: str
    titulo: str
    descricao: str
    quantidade: float | None
    marca: str | None
    modelo: str | None
    valor_unitario: float | None
    valor_total: float | None
    valor_unitario_estimado: float | None
    vencedor: str | None
    cnpj_vencedor: str | None
    melhor_oferta: float | None
    motivo_falha: str | None
    participantes_exibidos: list[NormalizedParticipant]
    participantes_totais: int
    classificados: int
    desclassificados: int
    inabilitados: int


@dataclass(slots=True)
class NormalizedReportData:
    source_path: str
    source_file_name: str
    generated_at: str
    header: ReportHeaderMetadata
    summary: dict[str, int]
    adjudicados: list[NormalizedLot]
    malsucedidos: list[NormalizedLot]


def _warn(logger: logging.Logger | None, message: str) -> None:
    if logger:
        logger.warning(message)


def _positive_values(*values: float | None) -> list[float]:
    result: list[float] = []
    for value in values:
        if value is None:
            continue
        parsed = float(value)
        if parsed > 0:
            result.append(parsed)
    return result


def _best_offer_from_participants(participantes: Iterable[LotParticipant]) -> float | None:
    candidates: list[float] = []
    for participant in participantes:
        candidates.extend(_positive_values(participant.oferta_final, participant.oferta_inicial))
    return min(candidates) if candidates else None


def _normalize_reason(reason: str | None) -> str | None:
    text = ' '.join(str(reason or '').replace('\n', ' ').split()).strip(' |')
    if not text:
        return None

    normalized_parts: list[str] = []
    seen: set[str] = set()
    for chunk in text.split('|'):
        candidate = ' '.join(chunk.split()).strip(' .;')
        if not candidate:
            continue
        key = candidate.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized_parts.append(candidate)

    if not normalized_parts:
        return None
    return ' | '.join(normalized_parts)


def _normalize_participant(participant: LotParticipant) -> NormalizedParticipant:
    if participant.section == 'MOVIMENTOS':
        oferta_registrada = next(iter(_positive_values(participant.oferta_inicial, participant.oferta_final)), None)
        return NormalizedParticipant(
            section='MOVIMENTOS',
            section_label=SECTION_LABELS['MOVIMENTOS'],
            ranking=participant.ranking,
            participante_numero=participant.participante_numero,
            razao_social=participant.razao_social,
            documento=participant.documento,
            oferta_inicial=None,
            oferta_final=None,
            oferta_registrada=oferta_registrada,
            diferenca_percentual=None,
            me_epp=participant.me_epp,
        )

    section = participant.section if participant.section in SECTION_LABELS else 'CLASSIFICACAO'
    return NormalizedParticipant(
        section=section,  # type: ignore[arg-type]
        section_label=SECTION_LABELS.get(section, 'Classificação'),
        ranking=participant.ranking,
        participante_numero=participant.participante_numero,
        razao_social=participant.razao_social,
        documento=participant.documento,
        oferta_inicial=participant.oferta_inicial,
        oferta_final=participant.oferta_final,
        oferta_registrada=None,
        diferenca_percentual=participant.diferenca_percentual,
        me_epp=participant.me_epp,
    )


def prepare_lote_data(lot: LotRecord, logger: logging.Logger | None = None) -> NormalizedLot:
    structured_raw = [
        participant
        for participant in lot.participantes
        if participant.section in {'CLASSIFICACAO', 'DESCLASSIFICADOS', 'INABILITADOS'}
    ]
    movement_raw = [participant for participant in lot.participantes if participant.section == 'MOVIMENTOS']
    display_participants = structured_raw if structured_raw else movement_raw

    structured_best = _best_offer_from_participants(structured_raw)
    movement_best = _best_offer_from_participants(movement_raw)
    best_offer = lot.melhor_lance or structured_best or movement_best or lot.item.valor_unitario_estimado
    reason = _normalize_reason(lot.motivo_falha)

    if lot.status.strip().upper() in MALSUCEDIDO_STATUSES and not reason:
        _warn(logger, f'Lote {lot.numero_lote}: motivo consolidado não identificado para status {lot.status}.')
    if not best_offer:
        _warn(logger, f'Lote {lot.numero_lote}: melhor oferta não identificada no bloco renderizável.')

    descricao = ' '.join((lot.item.descricao or lot.titulo or '').split()).strip()
    return NormalizedLot(
        numero_lote=lot.numero_lote,
        status=lot.status,
        titulo=lot.titulo,
        descricao=descricao,
        quantidade=lot.item.quantidade,
        marca=lot.item.marca,
        modelo=lot.item.modelo,
        valor_unitario=lot.item.valor_unitario,
        valor_total=lot.item.valor_total,
        valor_unitario_estimado=lot.item.valor_unitario_estimado,
        vencedor=lot.vencedor,
        cnpj_vencedor=lot.cnpj_vencedor,
        melhor_oferta=best_offer,
        motivo_falha=reason,
        participantes_exibidos=[_normalize_participant(participant) for participant in display_participants],
        participantes_totais=len(display_participants) if display_participants else len(lot.participantes),
        classificados=sum(1 for participant in structured_raw if participant.section == 'CLASSIFICACAO'),
        desclassificados=sum(1 for participant in structured_raw if participant.section == 'DESCLASSIFICADOS'),
        inabilitados=sum(1 for participant in structured_raw if participant.section == 'INABILITADOS'),
    )


def normalize_lot(lot: LotRecord, logger: logging.Logger | None = None) -> NormalizedLot:
    return prepare_lote_data(lot, logger=logger)


def _build_header_metadata(
    result: AtaSessaoParseResult,
    metadata: dict[str, str | None] | None = None,
) -> ReportHeaderMetadata:
    source_file_name = Path(result.source_path).name
    metadata = metadata or {}
    return ReportHeaderMetadata(
        arquivo_origem=(metadata.get('arquivo_origem') or source_file_name).strip(),
        data_geracao=(metadata.get('data_geracao') or result.generated_at).strip(),
        edital=(metadata.get('edital') or result.edital or '').strip() or None,
        processo_administrativo=(metadata.get('processo_administrativo') or result.processo_administrativo or '').strip() or None,
    )


def normalize_report_data(
    result: AtaSessaoParseResult,
    *,
    metadata: dict[str, str | None] | None = None,
    logger: logging.Logger | None = None,
) -> NormalizedReportData:
    adjudicados = [prepare_lote_data(lot, logger=logger) for lot in result.adjudicados]
    malsucedidos = [prepare_lote_data(lot, logger=logger) for lot in result.malsucedidos]
    return NormalizedReportData(
        source_path=result.source_path,
        source_file_name=Path(result.source_path).name,
        generated_at=result.generated_at,
        header=_build_header_metadata(result, metadata=metadata),
        summary=result.build_summary(),
        adjudicados=adjudicados,
        malsucedidos=malsucedidos,
    )
