import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/shared/modal";
import { maskCpf } from "@/features/cadastros/form";

interface PasswordResetDialogProps {
  open: boolean;
  onClose: () => void;
}

export function PasswordResetDialog({ open, onClose }: PasswordResetDialogProps) {
  const [username, setUsername] = useState("");
  const [cpf, setCpf] = useState("");
  const [matricula, setMatricula] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const requestMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: (result) => {
      setResetToken(result.resetToken ?? null);
    },
  });
  const completeMutation = trpc.auth.completePasswordReset.useMutation();

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestMutation.mutateAsync({ username, cpf, matricula, dataNascimento });
  }

  async function handleComplete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetToken) return;
    await completeMutation.mutateAsync({ username, resetToken, newPassword, confirmPassword });
  }

  return (
    <Modal open={open} onClose={onClose} size="md" title="Redefinir senha">
      <div className="space-y-4">
        {!resetToken ? (
          <form className="space-y-4" onSubmit={handleRequest}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Usuario" className="sm:col-span-2">
                <Input required value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
              </FormField>
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
            {requestMutation.data ? <Alert variant="info">{requestMutation.data.message}</Alert> : null}
            {requestMutation.error ? <Alert variant="error">{requestMutation.error.message}</Alert> : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Fechar</Button>
              <Button type="submit" loading={requestMutation.isPending} icon={<KeyRound className="h-4 w-4" />}>
                Validar identidade
              </Button>
            </div>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleComplete}>
            <Alert variant="success">Identidade validada. Informe a nova senha para concluir.</Alert>
            <FormField label="Nova senha">
              <Input required type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
            </FormField>
            <FormField label="Confirmacao">
              <Input required type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
            </FormField>
            {completeMutation.data ? <Alert variant="success">Senha redefinida. Entre novamente com a nova senha.</Alert> : null}
            {completeMutation.error ? <Alert variant="error">{completeMutation.error.message}</Alert> : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Fechar</Button>
              <Button type="submit" loading={completeMutation.isPending} icon={<KeyRound className="h-4 w-4" />}>
                Salvar nova senha
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
