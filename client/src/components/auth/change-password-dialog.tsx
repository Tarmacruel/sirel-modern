import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/shared/modal";

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function ChangePasswordDialog({ open, onClose, onChanged }: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const mutation = trpc.auth.changePassword.useMutation({
    onSuccess: () => onChanged(),
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutation.mutateAsync({ currentPassword, newPassword, confirmPassword });
  }

  return (
    <Modal open={open} onClose={onClose} size="md" title="Alterar minha senha">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormField label="Senha atual">
          <Input required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
        </FormField>
        <FormField label="Nova senha">
          <Input required type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
        </FormField>
        <FormField label="Confirmacao">
          <Input required type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
        </FormField>
        {mutation.error ? <Alert variant="error">{mutation.error.message}</Alert> : null}
        <Alert variant="info">Ao alterar a senha, suas sessoes ativas serao encerradas.</Alert>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending} icon={<KeyRound className="h-4 w-4" />}>
            Alterar senha
          </Button>
        </div>
      </form>
    </Modal>
  );
}
