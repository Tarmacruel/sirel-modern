import type { FormEvent } from "react";

import { processoTipoObjetoLabels, processoTipoObjetoOptions } from "@sirel/shared/const";
import { processoReceberNaLicitacaoInputSchema } from "@sirel/shared/schemas/processos";

import { Modal } from "@/components/shared/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type CatalogOption = { id: number; nome: string };

interface LicitacaoReceberProcessoModalProps {
  secretarias: CatalogOption[];
  modalidades: CatalogOption[];
  onClose: () => void;
  onCreated: (id: number) => void;
}

export function LicitacaoReceberProcessoModal({
  secretarias,
  modalidades,
  onClose,
  onCreated,
}: LicitacaoReceberProcessoModalProps) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format();
  const utils = trpc.useUtils();
  const mutation = trpc.processos.receberNaLicitacao.useMutation({
    onSuccess: ({ id }) => {
      void utils.licitacao.invalidate();
      void utils.processos.invalidate();
      void utils.workflow.invalidate();
      void utils.dashboard.invalidate();
      onCreated(id);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = processoReceberNaLicitacaoInputSchema.safeParse({
      ...fields,
      anoReferencia: Number(fields.anoReferencia),
      secretariaId: Number(fields.secretariaId),
      modalidadeId: Number(fields.modalidadeId),
    });
    if (parsed.success) {
      mutation.mutate(parsed.data);
      return;
    }
    const issue = parsed.error.issues[0];
    const field = event.currentTarget.elements.namedItem(String(issue?.path[0]));
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      field.setCustomValidity("Confira este campo.");
      field.reportValidity();
    }
  }

  function close() {
    if (!mutation.isPending) onClose();
  }

  return (
    <Modal
      open
      size="md"
      title="Receber processo"
      onClose={close}
      actions={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={mutation.isPending}>Cancelar</Button>
          <Button type="submit" form="licitacao-receber-processo" loading={mutation.isPending}>
            Receber e abrir
          </Button>
        </div>
      }
    >
      <form
        id="licitacao-receber-processo"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={handleSubmit}
        onInput={(event) => {
          const field = event.target;
          if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
            field.setCustomValidity("");
          }
        }}
      >
        <FormField label="Recebido de">
          <Select name="recebidoDe" required defaultValue="">
            <option value="" disabled>Selecione a origem</option>
            <option value="COMPRAS">Compras</option>
            <option value="PLANEJAMENTO">Planejamento</option>
          </Select>
        </FormField>
        <FormField label="Data de recebimento">
          <Input name="dataEntradaLicitacao" type="date" required defaultValue={today} />
        </FormField>
        <FormField label="Processo administrativo">
          <Input name="numeroAdministrativo" maxLength={64} required />
        </FormField>
        <FormField label="Ano de referência">
          <Input name="anoReferencia" type="number" min={2020} max={2100} required defaultValue={today.slice(0, 4)} />
        </FormField>
        <FormField label="Secretaria requisitante">
          <Select name="secretariaId" required defaultValue="">
            <option value="" disabled>Selecione a secretaria</option>
            {secretarias.map(({ id, nome }) => <option key={id} value={id}>{nome}</option>)}
          </Select>
        </FormField>
        <FormField label="Modalidade">
          <Select name="modalidadeId" required defaultValue="">
            <option value="" disabled>Selecione a modalidade</option>
            {modalidades.map(({ id, nome }) => <option key={id} value={id}>{nome}</option>)}
          </Select>
        </FormField>
        <FormField label="Tipo de objeto">
          <Select name="tipoObjeto" required defaultValue="">
            <option value="" disabled>Selecione o tipo</option>
            {processoTipoObjetoOptions.filter((tipo) => tipo !== "SERVICO").map((tipo) => (
              <option key={tipo} value={tipo}>{processoTipoObjetoLabels[tipo]}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Objeto" className="sm:col-span-2">
          <Textarea name="objeto" required minLength={10} rows={3} />
        </FormField>
        {mutation.error ? (
          <div className="sm:col-span-2">
            <Alert variant="error" title="Não foi possível receber">{mutation.error.message}</Alert>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
