import { z } from "zod";

const email = z.string().trim().min(1, "El correo es obligatorio.").email("Ingresa un correo válido.");
const password = z
  .string()
  .min(8, "Usa al menos 8 caracteres.")
  .max(72, "La contraseña no puede superar 72 caracteres.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "La contraseña es obligatoria."),
  next: z.string().optional(),
});

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Ingresa tu nombre.")
      .max(80, "El nombre es demasiado largo."),
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export const emailSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });
