import { z } from "zod";

import {
  subsystemAccessLevelValues,
  subsystemKeyValues,
} from "../subsystems.js";

export const usuarioSubsystemAccessInputSchema = z.object({
  subsystemKey: z.enum(subsystemKeyValues),
  accessLevel: z.enum(subsystemAccessLevelValues).default("VIEWER"),
  isDefault: z.boolean().default(false),
  ativo: z.boolean().default(true),
  observacao: z.string().trim().max(500).nullable().optional(),
});

export const usuarioListInputSchema = z.object({
  search: z.string().trim().optional(),
  secretariaId: z.number().int().positive().optional(),
  ativo: z.boolean().optional(),
});

export const usuarioCreateInputSchema = z.object({
  username: z.string().trim().min(3).max(80),
  name: z.string().trim().min(3).max(255),
  email: z.string().trim().email().optional(),
  role: z.enum(["user", "admin", "gestor", "operador", "auditor"]),
  secretariaId: z.number().int().positive().optional(),
  ativo: z.boolean().default(true),
  password: z.string().min(8).max(120),
  subsystemAccess: z.array(usuarioSubsystemAccessInputSchema).optional(),
});

export const usuarioUpdateInputSchema = z.object({
  userId: z.number().int().positive(),
  name: z.string().trim().min(3).max(255),
  email: z.string().trim().email().optional(),
  role: z.enum(["user", "admin", "gestor", "operador", "auditor"]),
  secretariaId: z.number().int().positive().nullable().optional(),
  ativo: z.boolean(),
  subsystemAccess: z.array(usuarioSubsystemAccessInputSchema).optional(),
});

export const usuarioResetPasswordInputSchema = z.object({
  userId: z.number().int().positive(),
  newPassword: z.string().min(8).max(120),
});

export const usuarioChangePasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(120),
    confirmPassword: z.string().min(8).max(120),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "A confirmacao da senha nao confere.",
      });
    }
  });

export type UsuarioListInput = z.infer<typeof usuarioListInputSchema>;
export type UsuarioSubsystemAccessInput = z.infer<
  typeof usuarioSubsystemAccessInputSchema
>;
export type UsuarioCreateInput = z.infer<typeof usuarioCreateInputSchema>;
export type UsuarioUpdateInput = z.infer<typeof usuarioUpdateInputSchema>;
export type UsuarioResetPasswordInput = z.infer<typeof usuarioResetPasswordInputSchema>;
export type UsuarioChangePasswordInput = z.infer<typeof usuarioChangePasswordInputSchema>;
