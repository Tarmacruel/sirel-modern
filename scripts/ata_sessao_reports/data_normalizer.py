from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Literal

from .models import AtaSessaoParseResult, LotItemData, LotParticipant, LotRecord, is_malsucedido_status

DisplaySection = Literal["CLASSIFICACAO", "DESCLASSIFICADOS", "INABILITADOS", "MOVIMENTOS"]

SECTION_LABELS: dict[str, str] = {
    "CLASSIFICACAO": "Classificação",
    "DESCLASSIFICADOS": "Desclassificados",
    "INABILITADOS": "Inabilitados",
    "MOVIMENTOS": "Participantes detectados nos movimentos",
}

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
class NormalizedItem:
    item_numero: str | None
    catmat_catser: str | None
    unidade: str | None
    descricao: str | None
    quantidade: float | None
    valor_unitario: float | None
    valor_total: float | None
    valor_unitario_estimado: float | None
    valor_total_estimado: float | None
    valor_estimado_fonte: str | None
    valor_estimado_confianca: str | None
    valor_estimado_processo_fonte: str | None
    valor_estimado_conciliacao: str | None
    valor_estimado_correspondencia: str | None
    marca: str | None
    modelo: str | None


@dataclass(slots=True)
class NormalizedLot:
    numero_lote: int
    status: str
    titulo: str
    descricao: str
    total_itens: int
    quantidade_total: float | None
    valor_total_lote: float | None
    valor_total_estimado: float | None
    valor_estimado_cobertura: str
    itens_estimados: int
    marca: str | None
    modelo: str | None
    vencedor: str | None
    cnpj_vencedor: str | None
    melhor_oferta: float | None
    motivo_falha: str | None
    itens: list[NormalizedItem]
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
    em_andamento: list[NormalizedLot]
    adjudicados: list[NormalizedLot]
    fase_recursal: list[NormalizedLot]
    malsucedidos: list[NormalizedLot]
    estimated_value_reconciliation: dict[str, Any] | None


def _warn(logger: logging.Logger | None, message: str) -> None:
    if logger:
        logger.warning(message)


def _positive_values(*values: float | None) -> list[float]:
    return [float(v) for v in values if v is not None and float(v) > 0]


def _best_offer_from_participants(participantes: Iterable[LotParticipant]) -> float | None:
    candidates: list[float] = []
    for p in participantes:
        candidates.extend(_positive_values(p.oferta_final, p.oferta_inicial))
    return min(candidates) if candidates else None


def _normalize_reason(reason: str | None) -> str | None:
    text = " ".join(str(reason or "").replace("\n", " ").split()).strip(" |")
    if not text:
        return None

    normalized_parts: list[str] = []
    seen: set[str] = set()
    for chunk in text.split("|"):
        candidate = " ".join(chunk.split()).strip(" .;")
        if candidate and candidate.casefold() not in seen:
            seen.add(candidate.casefold())
            normalized_parts.append(candidate)

    return " | ".join(normalized_parts) if normalized_parts else None


def _normalize_item(item: LotItemData) -> NormalizedItem:
    return NormalizedItem(
        item_numero=item.item_numero,
        catmat_catser=item.catmat_catser,
        unidade=item.unidade,
        descricao=item.descricao,
        quantidade=item.quantidade,
        valor_unitario=item.valor_unitario,
        valor_total=item.valor_total,
        valor_unitario_estimado=item.valor_unitario_estimado,
        valor_total_estimado=item.valor_total_estimado,
        valor_estimado_fonte=item.valor_estimado_fonte,
        valor_estimado_confianca=item.valor_estimado_confianca,
        valor_estimado_processo_fonte=item.valor_estimado_processo_fonte,
        valor_estimado_conciliacao=item.valor_estimado_conciliacao,
        valor_estimado_correspondencia=item.valor_estimado_correspondencia,
        marca=item.marca,
        modelo=item.modelo,
    )


def _normalize_participant(participant: LotParticipant) -> NormalizedParticipant:
    if participant.section == "MOVIMENTOS":
        oferta_registrada = next(iter(_positive_values(participant.oferta_inicial, participant.oferta_final)), None)
        return NormalizedParticipant(
            section="MOVIMENTOS",
            section_label=SECTION_LABELS["MOVIMENTOS"],
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

    section = participant.section if participant.section in SECTION_LABELS else "CLASSIFICACAO"
    return NormalizedParticipant(
        section=section,  # type: ignore[arg-type]
        section_label=SECTION_LABELS.get(section, "Classificação"),
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
        if participant.section in {"CLASSIFICACAO", "DESCLASSIFICADOS", "INABILITADOS"}
    ]
    movement_raw = [participant for participant in lot.participantes if participant.section == "MOVIMENTOS"]
    display_participants = structured_raw if structured_raw else movement_raw

    structured_best = _best_offer_from_participants(structured_raw)
    movement_best = _best_offer_from_participants(movement_raw)
    best_offer = lot.melhor_lance or structured_best or movement_best

    quantidade_total_raw = sum(i.quantidade or 0 for i in lot.itens)
    valor_total_lote_raw = sum(i.valor_total or 0 for i in lot.itens)
    total_itens = len(lot.itens)
    itens_estimados = sum(
        1
        for item in lot.itens
        if item.valor_unitario_estimado is not None and item.valor_total_estimado is not None
    )
    cobertura_estimativa = (
        f"Completa ({itens_estimados}/{total_itens})"
        if total_itens > 0 and itens_estimados == total_itens
        else f"Parcial ({itens_estimados}/{total_itens})"
        if itens_estimados > 0
        else f"Não conciliada (0/{total_itens})"
    )
    valor_total_estimado = (
        sum(float(item.valor_total_estimado or 0) for item in lot.itens)
        if total_itens > 0 and itens_estimados == total_itens
        else None
    )

    quantidade_total = quantidade_total_raw if quantidade_total_raw > 0 else None
    valor_total_lote = valor_total_lote_raw if valor_total_lote_raw > 0 else None

    primeiro = lot.itens[0] if lot.itens else None

    # Regra:
    # - lote com 1 item: pode herdar descricao/marca/modelo do item
    # - lote com vários itens: usa o título do lote e NÃO replica marca/modelo do item 1
    if total_itens <= 1:
        descricao = (primeiro.descricao if primeiro and primeiro.descricao else None) or lot.titulo or "-"
        marca = primeiro.marca if primeiro and primeiro.marca else None
        modelo = primeiro.modelo if primeiro and primeiro.modelo else None
    else:
        descricao = lot.titulo or (primeiro.descricao if primeiro and primeiro.descricao else "-")
        marca = None
        modelo = None

    reason = _normalize_reason(lot.motivo_falha)

    if is_malsucedido_status(lot.status) and not reason:
        _warn(logger, f"Lote {lot.numero_lote}: motivo consolidado não identificado para status {lot.status}.")
    if not best_offer:
        _warn(logger, f"Lote {lot.numero_lote}: melhor oferta não identificada no bloco renderizável.")

    return NormalizedLot(
        numero_lote=lot.numero_lote,
        status=lot.status,
        titulo=lot.titulo,
        descricao=descricao,
        total_itens=total_itens,
        quantidade_total=quantidade_total,
        valor_total_lote=valor_total_lote,
        valor_total_estimado=valor_total_estimado,
        valor_estimado_cobertura=cobertura_estimativa,
        itens_estimados=itens_estimados,
        marca=marca,
        modelo=modelo,
        vencedor=lot.vencedor,
        cnpj_vencedor=lot.cnpj_vencedor,
        melhor_oferta=best_offer,
        motivo_falha=reason,
        itens=[_normalize_item(item) for item in lot.itens],
        participantes_exibidos=[_normalize_participant(participant) for participant in display_participants],
        participantes_totais=len(display_participants) if display_participants else len(lot.participantes),
        classificados=sum(1 for participant in structured_raw if participant.section == "CLASSIFICACAO"),
        desclassificados=sum(1 for participant in structured_raw if participant.section == "DESCLASSIFICADOS"),
        inabilitados=sum(1 for participant in structured_raw if participant.section == "INABILITADOS"),
    )

def _build_header_metadata(
    result: AtaSessaoParseResult,
    metadata: dict[str, str | None] | None = None,
) -> ReportHeaderMetadata:
    metadata = metadata or {}
    return ReportHeaderMetadata(
        arquivo_origem=(metadata.get("arquivo_origem") or Path(result.source_path).name).strip(),
        data_geracao=(metadata.get("data_geracao") or result.generated_at).strip(),
        edital=(metadata.get("edital") or result.edital or "").strip() or None,
        processo_administrativo=(metadata.get("processo_administrativo") or result.processo_administrativo or "").strip() or None,
    )


def normalize_report_data(
    result: AtaSessaoParseResult,
    *,
    metadata: dict[str, str | None] | None = None,
    logger: logging.Logger | None = None,
) -> NormalizedReportData:
    return NormalizedReportData(
        source_path=result.source_path,
        source_file_name=Path(result.source_path).name,
        generated_at=result.generated_at,
        header=_build_header_metadata(result, metadata),
        summary=result.build_summary(),
        em_andamento=[prepare_lote_data(lot, logger) for lot in result.em_andamento],
        adjudicados=[prepare_lote_data(lot, logger) for lot in result.adjudicados],
        fase_recursal=[prepare_lote_data(lot, logger) for lot in result.fase_recursal],
        malsucedidos=[prepare_lote_data(lot, logger) for lot in result.malsucedidos],
        estimated_value_reconciliation=result.estimated_value_reconciliation,
    )
