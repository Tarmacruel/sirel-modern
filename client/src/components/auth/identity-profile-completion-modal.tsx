import { useState, type FormEvent } from "react";
import { LogOut, ShieldCheck } from "lucide-react";

import type { AuthUser } from "@/lib/auth-session";
import { trpc } from "@/lib/trpc";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/shared/modal";
import { maskCpf } from "@/features/cadastros/form";

interface IdentityProfileCompletionModalProps {
  open: boolean;
  user: AuthUser;
  onCompleted: (user: AuthUser) => void;
  onDismiss: () => void;
  onLogout: () => void;
}

const missingLabels: Record<string, string> = {
  PESSOA_LINK: "Vinculo com pessoa/servidor",
  CPF: "CPF",
  MATRICULA: "Matricula",
  DATA_NASCIMENTO: "Data de nascimento",
};

export function IdentityProfileCompletionModal({
  open,
  user,
  onCompleted,
  onDismiss,
  onLogout,
}: IdentityProfileCompletionModalProps) {
  const required = user.identityCompletionMode === "REQUIRED";
  const identityProfile = user.identityProfile;
  const missingFields = Array.isArray(identityProfile?.missingFields)
    ? identityProfile.missingFields
    : ["PESSOA_LINK", "CPF", "MATRICULA", "DATA_NASCIMENTO"];
  const missingFieldsLabel = missingFields.length
    ? missingFields.map((field) => missingLabels[field] ?? field).join(", ")
    : "Dados funcionais pendentes";
  const [cpf, setCpf] = useState("");
  const [matricula, setMatricula] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const mutation = trpc.auth.completeIdentityProfile.useMutation({
    onSuccess: (result) => {
      onCompleted(result.user as AuthUser);
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutation.mutateAsync({
      cpf,
      matricula,
      dataNascimento,
    });
  }

  return (
    <Modal
      open={open}
      onClose={required ? () => undefined : onDismiss}
      size="md"
      title="Regularizar identidade"
      description="Confirme os dados funcionais para habilitar recuperacao segura de credenciais."
      actions={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="destructive" onClick={onLogout} icon={<LogOut className="h-4 w-4" />}>
            Sair
          </Button>
          {!required ? (
            <Button variant="outline" onClick={onDismiss}>
              Lembrar depois
            </Button>
          ) : (
            <Button variant="outline" onClick={() => window.location.assign("mailto:suporte@sirel.local")}>
              Acionar suporte
            </Button>
          )}
        </div>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Alert variant={required ? "warning" : "info"} title={required ? "Acesso aguardando regularizacao" : "Perfil incompleto"}>
          Pendencias: {missingFieldsLabel}.
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="CPF">
            <Input
              required
              value={cpf}
              onChange={(event) => setCpf(maskCpf(event.target.value))}
              autoComplete="off"
              placeholder={identityProfile?.cpfMasked ?? "000.000.000-00"}
            />
          </FormField>
          <FormField label="Matricula">
            <Input
              required
              value={matricula}
              onChange={(event) => setMatricula(event.target.value)}
              autoComplete="off"
              placeholder={identityProfile?.matriculaMasked ?? "Matricula funcional"}
            />
          </FormField>
          <FormField label="Data de nascimento" className="sm:col-span-2">
            <Input
              required
              type="date"
              value={dataNascimento}
              onChange={(event) => setDataNascimento(event.target.value)}
              autoComplete="bday"
            />
          </FormField>
        </div>

        {mutation.error ? <Alert variant="error">{mutation.error.message}</Alert> : null}

        <div className="flex justify-end">
          <Button type="submit" loading={mutation.isPending} icon={<ShieldCheck className="h-4 w-4" />}>
            Regularizar identidade
          </Button>
        </div>
      </form>
    </Modal>
  );
}
