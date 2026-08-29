"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  forgotPasswordAction,
  loginAction,
  registerAction,
  resendVerificationAction,
  resetPasswordAction,
} from "@/features/auth/actions";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { INITIAL_AUTH_STATE, type AuthActionState } from "@/features/auth/types";

function FieldError({ state, name }: { state: AuthActionState; name: string }) {
  const error = state.fieldErrors?.[name]?.[0];
  return error ? <span className="field-error">{error}</span> : null;
}

function FormStatus({ state }: { state: AuthActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <div className={`form-status ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
      <span aria-hidden="true">{state.status === "success" ? "✓" : "!"}</span>
      <p>{state.message}</p>
    </div>
  );
}

export function LoginForm({ nextPath, notice }: { nextPath: string; notice?: string }) {
  const [state, action] = useActionState(loginAction, INITIAL_AUTH_STATE);

  return (
    <form action={action} className="auth-form" noValidate>
      {notice ? <div className="form-status success"><span>✓</span><p>{notice}</p></div> : null}
      <FormStatus state={state} />
      <input type="hidden" name="next" value={nextPath} />
      <label>
        <span>Correo electrónico</span>
        <input name="email" type="email" autoComplete="email" placeholder="tu@correo.com" required />
        <FieldError state={state} name="email" />
      </label>
      <label>
        <span className="label-row">
          Contraseña
          <Link href="/forgot-password">¿La olvidaste?</Link>
        </span>
        <input name="password" type="password" autoComplete="current-password" placeholder="Tu contraseña" required />
        <FieldError state={state} name="password" />
      </label>
      <SubmitButton idleLabel="Ingresar" pendingLabel="Verificando" />
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, INITIAL_AUTH_STATE);

  return (
    <form action={action} className="auth-form" noValidate>
      <FormStatus state={state} />
      <label>
        <span>Nombre</span>
        <input name="fullName" type="text" autoComplete="name" placeholder="Tu nombre" required />
        <FieldError state={state} name="fullName" />
      </label>
      <label>
        <span>Correo electrónico</span>
        <input name="email" type="email" autoComplete="email" placeholder="tu@correo.com" required />
        <FieldError state={state} name="email" />
      </label>
      <div className="auth-field-grid">
        <label>
          <span>Contraseña</span>
          <input name="password" type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" required />
          <FieldError state={state} name="password" />
        </label>
        <label>
          <span>Confirmar</span>
          <input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Repite la contraseña" required />
          <FieldError state={state} name="confirmPassword" />
        </label>
      </div>
      <p className="form-legal">Al crear una cuenta aceptas usar SmartBetBot como información estadística, sin garantías de resultados.</p>
      <SubmitButton idleLabel="Crear cuenta" pendingLabel="Creando cuenta" />
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, INITIAL_AUTH_STATE);

  return (
    <form action={action} className="auth-form" noValidate>
      <FormStatus state={state} />
      <label>
        <span>Correo electrónico</span>
        <input name="email" type="email" autoComplete="email" placeholder="tu@correo.com" required />
        <FieldError state={state} name="email" />
      </label>
      <SubmitButton idleLabel="Enviar enlace" pendingLabel="Enviando" />
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, INITIAL_AUTH_STATE);

  if (state.status === "success") {
    return (
      <div className="auth-form">
        <FormStatus state={state} />
        <Link className="auth-submit" href="/login?message=password-updated">Volver al inicio de sesión →</Link>
      </div>
    );
  }

  return (
    <form action={action} className="auth-form" noValidate>
      <FormStatus state={state} />
      <label>
        <span>Nueva contraseña</span>
        <input name="password" type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" required />
        <FieldError state={state} name="password" />
      </label>
      <label>
        <span>Confirmar contraseña</span>
        <input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Repite la contraseña" required />
        <FieldError state={state} name="confirmPassword" />
      </label>
      <SubmitButton idleLabel="Actualizar contraseña" pendingLabel="Actualizando" />
    </form>
  );
}

export function ResendVerificationForm({ defaultEmail }: { defaultEmail?: string }) {
  const [state, action] = useActionState(resendVerificationAction, INITIAL_AUTH_STATE);

  return (
    <form action={action} className="auth-form compact-form" noValidate>
      <FormStatus state={state} />
      <label>
        <span>Correo electrónico</span>
        <input name="email" type="email" autoComplete="email" defaultValue={defaultEmail} placeholder="tu@correo.com" required />
        <FieldError state={state} name="email" />
      </label>
      <SubmitButton idleLabel="Reenviar confirmación" pendingLabel="Enviando" />
    </form>
  );
}
