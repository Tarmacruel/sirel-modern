import { useState, type FormEvent } from "react";
import { UserSearch } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/shared/modal";
import { maskCpf } from "@/features/cadastros/form";

interface UsernameRecoveryDialogProps {
  open: boolean;
  onClose: () => void;
}

export function UsernameRecoveryDialog({ open, onClose }: UsernameRecoveryDialogProps) {
  const [cpf, setCpf] = useState("");
  const [matricula, setMatricula] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const mutation = trpc.auth.recoverUsername.useMutation();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutation.mutateAsync({ cpf, matricula, dataNascimento });
  }

  const hints = mutation.data?.usernameHints ?? [];

  return (
    <Modal open={open} onClose={onClose} size="md" title="Esqueci meu usuario">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="CPF">
            <Input required value={cpf} onChange={(event) => setCpf(maskCpf(event.target.value))} />
          </FormField>
          <FormField label="Matricula">
            <Input required value={matricula} onChange={(event) => setMatricula(event.target.value)} />
          </FormField>
          <FormField label="Data de nascimento" className="sm:col-span-2">
            <Input required type="date" value={dataNascimento} onChange={(event) => setDataNascimento(event.target.value)} />
          </FormField>
        </div>

        {mutation.data ? (
          <Alert variant="success">
            {mutation.data.message}
            {hints.length ? <span className="mt-2 block font-semibold">Usuario provavel: {hints.join(", ")}</span> : null}
          </Alert>
        ) : null}
        {mutation.error ? <Alert variant="error">{mutation.error.message}</Alert> : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button type="submit" loading={mutation.isPending} icon={<UserSearch className="h-4 w-4" />}>
            Recuperar usuario
          </Button>
        </div>
      </form>
    </Modal>
  );
}
