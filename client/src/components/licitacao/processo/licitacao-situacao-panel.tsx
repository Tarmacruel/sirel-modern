import { useEffect, useState } from "react";
import {
  decisaoInput,
  resultadosItem,
  situacoesProcedimento,
  situacaoLabels,
} from "@sirel/shared/licitacao-situacao";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/shared/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatShortDateBR } from "@/lib/formatters";

export function LicitacaoSituacaoPanel({
  processoId,
  open,
  onOpenChange,
  documentos,
  onSaved,
}: {
  processoId: number;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  documentos: { id: number; titulo: string }[];
  onSaved: () => Promise<unknown>;
}) {
  const utils = trpc.useUtils();
  const query = trpc.licitacao.situacao.get.useQuery(
    { processoId },
    { retry: false },
  );
  const me = trpc.auth.me.useQuery();
  const manager = ["admin", "gestor"].includes(me.data?.user.role ?? "");
  const [acao, setAcao] = useState("PROCESSO");
  const [resultado, setResultado] =
    useState<(typeof situacoesProcedimento)[number]>("FRACASSADO");
  const [ids, setIds] = useState<number[]>([]);
  const [data, setData] = useState("");
  const [motivo, setMotivo] = useState("");
  const [documento, setDocumento] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const setProcess = trpc.licitacao.situacao.registrarProcesso.useMutation();
  const setItems = trpc.licitacao.situacao.registrarItens.useMutation();
  const reopen = trpc.licitacao.situacao.reabrirProcesso.useMutation();
  const reopenItems = trpc.licitacao.situacao.reabrirItens.useMutation();
  const current = query.data?.situacao ?? "EM_ANDAMENTO";
  const blocked = current !== "EM_ANDAMENTO";
  const isItems = acao.includes("ITENS"),
    isReopen = acao.startsWith("REABRIR");
  const selected = query.data?.itens.filter((i) => ids.includes(i.id)) ?? [];
  useEffect(() => {
    if (!open) return;
    setAcao(blocked ? "REABRIR_PROCESSO" : "PROCESSO");
    setReview(false);
    setError("");
    setIds([]);
    setData("");
    setMotivo("");
    setDocumento("");
  }, [open, processoId]);
  function start() {
    setAcao(blocked ? "REABRIR_PROCESSO" : "PROCESSO");
    setReview(false);
    setError("");
    setIds([]);
    setData("");
    setMotivo("");
    setDocumento("");
    onOpenChange(true);
  }
  async function submit() {
    const base = {
      processoId,
      data,
      justificativa: motivo,
      documentoId: documento ? Number(documento) : null,
    };
    const parsed = decisaoInput.safeParse(base);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (isItems && !selected.length) {
      setError("Selecione pelo menos um item.");
      return;
    }
    if (!review) {
      setError("");
      setReview(true);
      return;
    }
    setSaving(true);
    try {
      if (acao === "PROCESSO")
        await setProcess.mutateAsync({ ...base, situacao: resultado });
      else if (acao === "ITENS")
        await setItems.mutateAsync({
          ...base,
          itemIds: ids,
          resultado: resultado as (typeof resultadosItem)[number],
        });
      else if (acao === "REABRIR_PROCESSO") await reopen.mutateAsync(base);
      else await reopenItems.mutateAsync({ ...base, itemIds: ids });
      await Promise.all([
        utils.licitacao.situacao.get.invalidate({ processoId }),
        onSaved(),
        utils.licitacao.list.invalidate(),
        utils.dossie.invalidate(),
        utils.processos.invalidate(),
      ]);
      onOpenChange(false);
      setReview(false);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível registrar a decisão.",
      );
      setReview(false);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      aria-label="Situação do procedimento"
      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong>{situacaoLabels[current] ?? current}</strong>
          {query.data?.decisao && (
            <p className="mt-1 text-[var(--text-secondary)]">
              {formatShortDateBR(query.data.decisao.data)} ·{" "}
              {query.data.decisao.justificativa}
            </p>
          )}
          {blocked && (
            <p className="mt-1">
              Andamento interrompido. Documentos e histórico continuam
              disponíveis.
            </p>
          )}
          {!blocked && query.data?.sugestao && (
            <p className="mt-1">
              Todas as propostas estão desclassificadas ou inabilitadas. Confira
              e registre o fracasso, se essa for a decisão.
            </p>
          )}
          {!blocked && query.data?.todosEncerrados && (
            <p className="mt-1">
              Todos os itens estão encerrados. Defina a situação global do
              processo.
            </p>
          )}
          {(query.data?.itens.filter((i) => i.resultado).length ?? 0) > 0 && (
            <p className="mt-1">
              {query.data?.itens.filter((i) => i.resultado).length} de{" "}
              {query.data?.itens.length} itens encerrados.
            </p>
          )}
        </div>
        {(!blocked || manager) && (
          <Button variant="outline" onClick={start} disabled={!query.data}>
            {blocked
              ? current === "SUSPENSO"
                ? "Retomar processo"
                : "Reabrir processo"
              : "Definir situação"}
          </Button>
        )}
      </div>
      {query.error && (
        <p role="alert">
          Não foi possível carregar a situação.{" "}
          <button onClick={() => void query.refetch()}>Tentar novamente</button>
        </p>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer">
          Resultados dos itens e histórico de decisões
        </summary>
        <ul className="mt-2 space-y-1">
          {query.data?.itens.map((item) => (
            <li key={item.id}>
              Item {item.numeroItem}:{" "}
              {situacaoLabels[item.resultado ?? "EM_ANDAMENTO"]} —{" "}
              {item.descricao}
            </li>
          ))}
        </ul>
        {query.data?.historico.map((entry) => (
          <p
            key={entry.id}
            className="mt-3 border-t border-[var(--border-subtle)] pt-2"
          >
            {formatShortDateBR(entry.decisao.data)} ·{" "}
            {situacaoLabels[entry.decisao.situacao]} ·{" "}
            {entry.usuario ?? "Usuário registrado"}
            <br />
            {entry.decisao.justificativa}
            {entry.item_ids?.length
              ? ` · Itens: ${entry.item_ids.map((id: number) => query.data?.itens.find((i) => i.id === id)?.numeroItem ?? id).join(", ")}`
              : ""}
          </p>
        ))}
      </details>
      <Modal
        open={open}
        onClose={() => {
          if (!saving) {
            onOpenChange(false);
            setReview(false);
          }
        }}
        title={review ? "Confirmar decisão" : "Definir situação"}
      >
        {error && (
          <p role="alert" className="mb-4 text-[var(--danger-color)]">
            {error}
          </p>
        )}
        {review ? (
          <div className="space-y-3">
            <p>
              <strong>
                {isReopen ? "Retomada / reabertura" : situacaoLabels[resultado]}
              </strong>{" "}
              · {formatShortDateBR(data)}
            </p>
            <p>{motivo}</p>
            <p>
              {isItems
                ? `Itens: ${selected.map((i) => i.numeroItem).join(", ")}`
                : "Processo inteiro"}
            </p>
            <p>
              {documento
                ? `Documento: ${documentos.find((d) => d.id === Number(documento))?.titulo}`
                : "Sem documento vinculado"}
            </p>
            <p>
              {isReopen
                ? "O andamento será liberado e as pendências serão recalculadas. Resultados dos itens permanecem até sua reabertura individual."
                : isItems
                  ? "Os itens selecionados sairão das exigências de vencedor e contratação. Os demais continuarão no fluxo."
                  : resultado === "SUSPENSO"
                    ? "O andamento ficará pausado até a retomada por gestor."
                    : "O processo será encerrado sem contratação. Os itens ainda em andamento receberão este resultado; resultados já registrados serão preservados."}
            </p>
            <Button
              variant="outline"
              onClick={() => setReview(false)}
              disabled={saving}
            >
              Voltar e revisar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              Abrangência
              <Select
                aria-label="Abrangência"
                value={acao}
                onChange={(e) => {
                  setAcao(e.target.value);
                  setIds([]);
                  if (resultado === "SUSPENSO") setResultado("FRACASSADO");
                }}
              >
                {!blocked && (
                  <>
                    <option value="PROCESSO">Processo inteiro</option>
                    <option value="ITENS">Resultado de itens</option>
                  </>
                )}
                {manager && (
                  <>
                    <option value="REABRIR_PROCESSO" disabled={!blocked}>
                      Retomar / reabrir processo
                    </option>
                    <option value="REABRIR_ITENS" disabled={blocked}>
                      Reabrir itens
                    </option>
                  </>
                )}
              </Select>
            </label>
            {!isReopen && (
              <label className="block">
                Situação
                <Select
                  aria-label="Situação"
                  value={resultado}
                  onChange={(e) =>
                    setResultado(e.target.value as typeof resultado)
                  }
                >
                  {(isItems ? resultadosItem : situacoesProcedimento).map(
                    (value) => (
                      <option key={value} value={value}>
                        {situacaoLabels[value]}
                      </option>
                    ),
                  )}
                </Select>
              </label>
            )}
            {isItems && (
              <fieldset className="max-h-64 overflow-auto space-y-2">
                <legend>Itens atingidos</legend>
                {query.data?.itens
                  .filter((i) => (isReopen ? i.resultado : !i.resultado))
                  .map((item) => (
                    <label key={item.id} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={ids.includes(item.id)}
                        onChange={(e) =>
                          setIds(
                            e.target.checked
                              ? [...ids, item.id]
                              : ids.filter((id) => id !== item.id),
                          )
                        }
                      />
                      Item {item.numeroItem} — {item.descricao}
                    </label>
                  ))}
              </fieldset>
            )}
            <label className="block">
              Data da decisão
              <Input
                aria-label="Data da decisão"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </label>
            <label className="block">
              Justificativa
              <Textarea
                aria-label="Justificativa"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={4000}
              />
            </label>
            <label className="block">
              Documento do processo (opcional)
              <Select
                aria-label="Documento do processo"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
              >
                <option value="">Sem documento vinculado</option>
                {documentos.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.titulo}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        )}
        <Button className="mt-5" onClick={() => void submit()} loading={saving}>
          {review ? "Confirmar decisão" : "Revisar decisão"}
        </Button>
      </Modal>
    </section>
  );
}
