from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal

from .models import AtaSessaoParseResult, LotParticipant, LotRecord

StructuredSection = Literal['CLASSIFICACAO', 'DESCLASSIFICADOS', 'INABILITADOS']
DisplaySection = Literal['CLASSIFICACAO', 'DESCLASSIFICADOS', 'INABILITADOS', 'MOVIMENTOS']

SECTION_LABELS: dict[str, str] = {
    'CLASSIFICACAO': 'Classificação',
    'DESCLASSIFICADOS': 'Desclassificados',
    'INABILITADOS': 'Inabilitados',
    'MOVIMENTOS': 'Participantes detectados nos movimentos',
}


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
    generated_at: str
    summary: dict[str, int]
    adjudicados: list[NormalizedLot]
    malsucedidos: list[NormalizedLot]


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


def normalize_lot(lot: LotRecord) -> NormalizedLot:
    structured_raw = [participant for participant in lot.participantes if participant.section in {'CLASSIFICACAO', 'DESCLASSIFICADOS', 'INABILITADOS'}]
    movement_raw = [participant for participant in lot.participantes if participant.section == 'MOVIMENTOS']
    display_participants = structured_raw if structured_raw else movement_raw

    structured_best = _best_offer_from_participants(structured_raw)
    movement_best = _best_offer_from_participants(movement_raw)
    best_offer = lot.melhor_lance or structured_best or movement_best or lot.item.valor_unitario_estimado

    descricao = (lot.item.descricao or lot.titulo or '').strip()
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
        motivo_falha=lot.motivo_falha,
        participantes_exibidos=[_normalize_participant(participant) for participant in display_participants],
        participantes_totais=len(lot.participantes),
        classificados=sum(1 for participant in structured_raw if participant.section == 'CLASSIFICACAO'),
        desclassificados=sum(1 for participant in structured_raw if participant.section == 'DESCLASSIFICADOS'),
        inabilitados=sum(1 for participant in structured_raw if participant.section == 'INABILITADOS'),
    )


def normalize_report_data(result: AtaSessaoParseResult) -> NormalizedReportData:
    adjudicados = [normalize_lot(lot) for lot in result.adjudicados]
    malsucedidos = [normalize_lot(lot) for lot in result.malsucedidos]
    return NormalizedReportData(
        source_path=result.source_path,
        generated_at=result.generated_at,
        summary=result.build_summary(),
        adjudicados=adjudicados,
        malsucedidos=malsucedidos,
    )
