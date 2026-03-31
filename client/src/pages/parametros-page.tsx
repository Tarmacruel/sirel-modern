import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ShieldAlert, SlidersHorizontal } from "lucide-react";

import { SectionCard } from "@/components/shared/section-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatShortDateTimeBR } from "@/lib/formatters";
import { trpc } from "@/lib/trpc";

const categoriaOptions = [
  { value: "", label: "Todas as categorias" },
  { value: "INSTITUCIONAL", label: "Institucional" },
  { value: "REGRAS", label: "Regras" },
  { value: "INTEGRACAO", label: "Integrações" },
  { value: "COMPORTAMENTO", label: "Comportamento" },
  { value: "CATALOGOS", label: "Catálogos" },
] as const;

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function parseValue(input: string, tipoDado: string) {
  if (tipoDado === "string" || tipoDado === "date") return input;
  if (tipoDado === "number") return Number(input);
  if (tipoDado === "boolean") return input.trim().toLowerCase() === "true";
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function stringifyDateArray(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

function parseHolidayInput(input: string) {
  return Array.from(
    new Set(
      input
        .split(/[\r\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function ParametrosPage() {
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const [categoria, setCategoria] = useState("");
  const [busca, setBusca] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [valorInput, setValorInput] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [prazoExtraInput, setPrazoExtraInput] = useState("1");
  const [feriadosInput, setFeriadosInput] = useState("");
  const [legalFormError, setLegalFormError] = useState<string | null>(null);
  const [legalFormMessage, setLegalFormMessage] = useState<string | null>(null);

  const filtros = useMemo(
    () => ({
      categoria: (categoria || undefined) as any,
      busca: busca.trim() || undefined,
      apenasAtivos: true,
    }),
    [busca, categoria],
  );
  const listQuery = trpc.parametros.listar.useQuery(filtros, { retry: false });
  const rows = listQuery.data ?? [];
  const selected = rows.find((item) => item.id === selectedId) ?? null;
  const prazoExtraParam =
    rows.find(
      (item) => item.chave === "PRAZOS.MUNICIPIO.ACRESCIMO_DIAS_UTEIS",
    ) ?? null;
  const feriadosParam =
    rows.find((item) => item.chave === "PRAZOS.MUNICIPIO.FERIADOS_LOCAIS") ??
    null;
  const isAdmin = meQuery.data?.user.role === "admin";

  const historyQuery = trpc.parametros.historico.useQuery(
    { chave: selected?.chave ?? "" },
    { enabled: Boolean(selected?.chave) },
  );

  const updateMutation = trpc.parametros.atualizar.useMutation({
    onSuccess: async (payload) => {
      await Promise.all([
        utils.parametros.listar.invalidate(),
        utils.parametros.historico.invalidate(),
      ]);
      setFormError(null);
      setFormMessage(
        payload.requerReinicio
          ? "Parâmetro atualizado. Esta alteração exige reinício do sistema."
          : "Parâmetro atualizado com sucesso.",
      );
      setValorInput(stringifyValue(payload.parametro.valor));
      setJustificativa("");
    },
    onError: (error) => {
      setFormMessage(null);
      setFormError(error.message);
    },
  });
  const updateLegalParamsMutation = trpc.parametros.atualizar.useMutation({
    onSuccess: async () => {
      await utils.parametros.listar.invalidate();
      setLegalFormError(null);
      setLegalFormMessage("Calendário legal atualizado com sucesso.");
    },
    onError: (error) => {
      setLegalFormMessage(null);
      setLegalFormError(error.message);
    },
  });

  useEffect(() => {
    if (!prazoExtraParam && !feriadosParam) return;
    setPrazoExtraInput(
      String(
        typeof prazoExtraParam?.valor === "number" ? prazoExtraParam.valor : 1,
      ),
    );
    setFeriadosInput(stringifyDateArray(feriadosParam?.valor));
  }, [feriadosParam?.valor, prazoExtraParam?.valor]);

  function handleSelect(id: number) {
    setSelectedId(id);
    const item = rows.find((row) => row.id === id);
    setValorInput(stringifyValue(item?.valor));
    setJustificativa("");
    setFormError(null);
    setFormMessage(null);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setFormError(null);
    setFormMessage(null);

    const parsed = parseValue(valorInput, selected.tipoDado);
    if (selected.tipoDado === "number" && !Number.isFinite(Number(parsed))) {
      setFormError("Informe um número válido.");
      return;
    }

    await updateMutation.mutateAsync({
      id: selected.id,
      valor: parsed,
      justificativa: justificativa.trim() || undefined,
    });
  }

  async function handleSaveLegalCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLegalFormError(null);
    setLegalFormMessage(null);

    if (!prazoExtraParam || !feriadosParam) {
      setLegalFormError(
        "Os parâmetros municipais de prazo ainda não estão disponíveis.",
      );
      return;
    }

    const prazoExtra = Number(prazoExtraInput);
    if (!Number.isInteger(prazoExtra) || prazoExtra < 0) {
      setLegalFormError(
        "Informe um acréscimo municipal válido em dias úteis inteiros.",
      );
      return;
    }

    const feriados = parseHolidayInput(feriadosInput);
    const invalidos = feriados.filter(
      (item) => !/^\d{4}-\d{2}-\d{2}$/.test(item),
    );
    if (invalidos.length) {
      setLegalFormError(
        `Revise os feriados locais. Use o formato AAAA-MM-DD. Exemplo inválido: ${invalidos[0]}`,
      );
      return;
    }

    await updateLegalParamsMutation.mutateAsync({
      id: prazoExtraParam.id,
      valor: prazoExtra,
    });
    await updateLegalParamsMutation.mutateAsync({
      id: feriadosParam.id,
      valor: feriados,
    });
  }

  if (meQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Parâmetros do sistema"
        description="Configurações globais e regras de negócio que ajustam o comportamento do SIREL sem alteração de código."
        action={
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-indigo-800">
            <SlidersHorizontal className="h-4 w-4" />
            Governança
          </div>
        }
      >
        <SectionCard
          title="Calendário legal da Licitação"
          description="Parâmetros municipais usados no cálculo do Art. 55 + Art. 183 para publicação e recebimento de propostas."
        >
          {!prazoExtraParam || !feriadosParam ? (
            <Alert variant="info">
              Os parâmetros municipais ainda não foram carregados para edição
              guiada.
            </Alert>
          ) : (
            <form className="space-y-4" onSubmit={handleSaveLegalCalendar}>
              <div className="grid gap-4 xl:grid-cols-[240px_1fr]">
                <FormField label="Acréscimo municipal (dias úteis)">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={prazoExtraInput}
                    onChange={(event) => setPrazoExtraInput(event.target.value)}
                    disabled={!isAdmin}
                  />
                </FormField>
                <FormField label="Feriados locais">
                  <Textarea
                    rows={6}
                    value={feriadosInput}
                    onChange={(event) => setFeriadosInput(event.target.value)}
                    placeholder={"2026-04-21\n2026-05-01\n2026-06-24"}
                    disabled={!isAdmin}
                  />
                </FormField>
              </div>

              <Alert variant="info">
                Use uma data por linha no formato <code>AAAA-MM-DD</code>. Esses
                feriados passam a ser considerados no cálculo
                jurídico-operacional da Licitação em toda a instância.
              </Alert>

              {legalFormMessage ? (
                <Alert variant="success">{legalFormMessage}</Alert>
              ) : null}
              {legalFormError ? (
                <Alert variant="error">{legalFormError}</Alert>
              ) : null}

              <Button
                type="submit"
                disabled={!isAdmin || updateLegalParamsMutation.isPending}
              >
                {updateLegalParamsMutation.isPending
                  ? "Salvando calendário..."
                  : "Salvar calendário legal"}
              </Button>
            </form>
          )}
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_260px]">
              <FormField label="Buscar parâmetro">
                <Input
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Chave ou descrição"
                />
              </FormField>
              <FormField label="Categoria">
                <Select
                  value={categoria}
                  onChange={(event) => setCategoria(event.target.value)}
                >
                  {categoriaOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white">
              <Table className="min-w-[740px]">
                <TableHead>
                  <tr>
                    <TableHeaderCell>Chave</TableHeaderCell>
                    <TableHeaderCell>Categoria</TableHeaderCell>
                    <TableHeaderCell>Tipo</TableHeaderCell>
                    <TableHeaderCell>Versão</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {rows.map((item) => (
                    <TableRow
                      key={item.id}
                      onClick={() => handleSelect(item.id)}
                      className={[
                        "cursor-pointer transition",
                        item.id === selectedId
                          ? "bg-indigo-50/80"
                          : "hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <TableCell className="align-top">
                        <div className="font-semibold text-slate-900">
                          {item.chave}
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.descricao ?? "Sem descrição"}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        {item.categoria}
                      </TableCell>
                      <TableCell className="align-top">
                        {item.tipoDado}
                      </TableCell>
                      <TableCell className="align-top">{item.versao}</TableCell>
                    </TableRow>
                  ))}
                  {!rows.length ? (
                    <TableRow>
                      <TableCell
                        className="py-8 text-center text-slate-500"
                        colSpan={4}
                      >
                        {listQuery.isFetching
                          ? "Carregando parâmetros..."
                          : "Nenhum parâmetro encontrado."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-4">
            <SectionCard
              title="Editor de parâmetro"
              description="Somente administradores podem alterar os valores."
            >
              {!selected ? (
                <Alert variant="info">
                  Selecione um parâmetro na lista para visualizar detalhes.
                </Alert>
              ) : (
                <form className="space-y-4" onSubmit={handleSave}>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm">
                    <p>
                      <strong>Chave:</strong> {selected.chave}
                    </p>
                    <p>
                      <strong>Categoria:</strong> {selected.categoria}
                    </p>
                    <p>
                      <strong>Tipo:</strong> {selected.tipoDado}
                    </p>
                    <p>
                      <strong>Versão:</strong> {selected.versao}
                    </p>
                    {selected.requerReinicio ? (
                      <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-800">
                        <ShieldAlert className="h-4 w-4" />
                        Requer reinício
                      </p>
                    ) : null}
                  </div>

                  <FormField label="Valor">
                    <Textarea
                      rows={8}
                      value={valorInput}
                      onChange={(event) => setValorInput(event.target.value)}
                      disabled={!isAdmin}
                    />
                  </FormField>

                  {selected.requerReinicio ? (
                    <FormField label="Justificativa da alteração">
                      <Textarea
                        rows={3}
                        value={justificativa}
                        onChange={(event) =>
                          setJustificativa(event.target.value)
                        }
                        placeholder="Obrigatória para parâmetros críticos."
                        disabled={!isAdmin}
                      />
                    </FormField>
                  ) : null}

                  {formMessage ? (
                    <Alert variant="success">{formMessage}</Alert>
                  ) : null}
                  {formError ? (
                    <Alert variant="error">{formError}</Alert>
                  ) : null}

                  <Button
                    type="submit"
                    disabled={!isAdmin || updateMutation.isPending}
                  >
                    {updateMutation.isPending
                      ? "Salvando..."
                      : "Salvar alteração"}
                  </Button>
                </form>
              )}
            </SectionCard>

            {selected ? (
              <SectionCard
                title="Histórico recente"
                description="Últimas alterações registradas para auditoria."
              >
                <div className="space-y-2">
                  {(historyQuery.data ?? []).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm"
                    >
                      <p className="font-semibold text-slate-900">
                        {item.alteradoPorNome}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatShortDateTimeBR(item.dataAlteracao)}
                      </p>
                      {item.justificativa ? (
                        <p className="mt-1 text-slate-700">
                          {item.justificativa}
                        </p>
                      ) : null}
                    </div>
                  ))}
                  {!historyQuery.data?.length ? (
                    <p className="text-sm text-slate-500">
                      {historyQuery.isFetching
                        ? "Carregando histórico..."
                        : "Sem alterações registradas para este parâmetro."}
                    </p>
                  ) : null}
                </div>
              </SectionCard>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
