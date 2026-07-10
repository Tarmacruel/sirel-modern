import { z } from "zod";

export const identityMissingFieldOptions = [
  "CPF",
  "MATRICULA",
  "DATA_NASCIMENTO",
  "PESSOA_LINK",
] as const;

export const identityCompletionModeOptions = ["REMINDER", "REQUIRED"] as const;

const cpfSchema = z
  .string()
  .trim()
  .min(11, "Informe o CPF.")
  .max(18, "Informe um CPF valido.");

const matriculaSchema = z
  .string()
  .trim()
  .min(1, "Informe a matricula.")
  .max(40, "Informe uma matricula valida.");

const dataNascimentoSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de nascimento.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;
    if (parsed.toISOString().slice(0, 10) !== value) return false;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return parsed <= today;
  }, "A data de nascimento nao pode estar no futuro.");

const passwordFieldsShape = {
  newPassword: z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").max(120),
  confirmPassword: z.string().min(8, "Confirme a nova senha.").max(120),
};

function withPasswordConfirmation<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "A confirmacao da senha nao confere.",
      });
    }
  });
}

const passwordFieldsSchema = withPasswordConfirmation(z.object(passwordFieldsShape));

export const recoverUsernameInputSchema = z.object({
  cpf: cpfSchema,
  matricula: matriculaSchema,
  dataNascimento: dataNascimentoSchema,
});

export const requestPasswordResetInputSchema = z.object({
  username: z.string().trim().min(3, "Informe o usuario.").max(120),
  cpf: cpfSchema,
  matricula: matriculaSchema,
  dataNascimento: dataNascimentoSchema,
});

export const completePasswordResetInputSchema = withPasswordConfirmation(z.object({
  ...passwordFieldsShape,
  username: z.string().trim().min(3, "Informe o usuario.").max(120),
  resetToken: z.string().trim().min(32, "Informe o codigo de recuperacao."),
}));

export const changePasswordInputSchema = withPasswordConfirmation(z.object({
  ...passwordFieldsShape,
  currentPassword: z.string().min(1, "Informe a senha atual."),
}));

export const completeIdentityProfileInputSchema = z.object({
  cpf: cpfSchema,
  matricula: matriculaSchema,
  dataNascimento: dataNascimentoSchema,
});

export type IdentityMissingField = (typeof identityMissingFieldOptions)[number];
export type IdentityCompletionMode = (typeof identityCompletionModeOptions)[number];
export type RecoverUsernameInput = z.infer<typeof recoverUsernameInputSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetInputSchema>;
export type CompletePasswordResetInput = z.infer<typeof completePasswordResetInputSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;
export type CompleteIdentityProfileInput = z.infer<typeof completeIdentityProfileInputSchema>;
