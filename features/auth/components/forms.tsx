"use client";

import Link from "next/link";
import React, { useState } from "react";
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

function EyeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

function FieldError({ state, name }: { state: AuthActionState; name: string }) {
  const error = state.fieldErrors?.[name]?.[0];
  return error ? <span className="field-error text-xs text-red-400 font-bold block mt-1">{error}</span> : null;
}

function FormStatus({ state }: { state: AuthActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <div
      className={`mb-4 rounded-xl p-3.5 text-xs font-bold ${
        state.status === "success"
          ? "bg-emerald-950/80 border border-emerald-700 text-emerald-300"
          : "bg-red-950/80 border border-red-700 text-red-300"
      }`}
      role={state.status === "error" ? "alert" : "status"}
    >
      <p>{state.status === "success" ? "✓ " : "⚠️ "}{state.message}</p>
    </div>
  );
}

export function LoginForm({ nextPath, notice, errorNotice }: { nextPath: string; notice?: string; errorNotice?: string }) {
  const [state, action] = useActionState(loginAction, INITIAL_AUTH_STATE);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="space-y-4" noValidate>
      {notice ? (
        <div className="mb-4 rounded-xl bg-emerald-950/80 border border-emerald-700 p-3.5 text-xs font-bold text-emerald-300">
          <p>✓ {notice}</p>
        </div>
      ) : null}
      {errorNotice && state.status === "idle" ? (
        <div className="mb-4 rounded-2xl bg-amber-950/80 border-2 border-amber-600/80 p-4 text-xs font-bold text-amber-200 shadow-lg">
          <div className="flex items-start gap-2.5">
            <span className="text-base">⚠️</span>
            <p className="leading-relaxed">{errorNotice}</p>
          </div>
        </div>
      ) : null}
      <FormStatus state={state} />
      <input type="hidden" name="next" value={nextPath} />
      
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1">Correo electrónico</label>
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          required
          className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
        />
        <FieldError state={state} name="email" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-bold text-slate-300">Contraseña</label>
          <Link href="/forgot-password" className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold">
            ¿La olvidaste?
          </Link>
        </div>
        <div className="relative flex items-center">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Tu contraseña"
            required
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-3.5 pr-10 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 p-1 text-slate-400 hover:text-emerald-400 transition cursor-pointer select-none"
            aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
          >
            {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>
        <FieldError state={state} name="password" />
      </div>

      <div className="pt-2">
        <SubmitButton idleLabel="Ingresar" pendingLabel="Verificando" />
      </div>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, INITIAL_AUTH_STATE);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormStatus state={state} />

      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1">Nombre Completo</label>
        <input
          name="fullName"
          type="text"
          autoComplete="name"
          placeholder="Tu nombre"
          required
          className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
        />
        <FieldError state={state} name="fullName" />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1">Correo electrónico</label>
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          required
          className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
        />
        <FieldError state={state} name="email" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1">Contraseña</label>
          <div className="relative flex items-center">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Mínimo 8 car."
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-3.5 pr-10 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 p-1 text-slate-400 hover:text-emerald-400 transition cursor-pointer select-none"
              aria-label={showPassword ? "Ocultar" : "Ver"}
            >
              {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>
          <FieldError state={state} name="password" />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1">Confirmar</label>
          <div className="relative flex items-center">
            <input
              name="confirmPassword"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Repite pass"
              required
              className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-3.5 pr-10 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-2.5 p-1 text-slate-400 hover:text-emerald-400 transition cursor-pointer select-none"
              aria-label={showConfirm ? "Ocultar" : "Ver"}
            >
              {showConfirm ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>
          <FieldError state={state} name="confirmPassword" />
        </div>
      </div>

      <p className="text-[11px] text-slate-400 leading-tight">
        Al crear una cuenta aceptas usar SmartBetBot como información estadística y de valor probabilístico.
      </p>

      <div className="pt-2">
        <SubmitButton idleLabel="Crear cuenta" pendingLabel="Creando cuenta" />
      </div>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, INITIAL_AUTH_STATE);

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormStatus state={state} />
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1">Correo electrónico</label>
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          required
          className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
        />
        <FieldError state={state} name="email" />
      </div>
      <div className="pt-2">
        <SubmitButton idleLabel="Enviar enlace" pendingLabel="Enviando" />
      </div>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, INITIAL_AUTH_STATE);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (state.status === "success") {
    return (
      <div className="space-y-4">
        <FormStatus state={state} />
        <Link
          className="block w-full text-center rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
          href="/login?message=password-updated"
        >
          Volver al inicio de sesión →
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormStatus state={state} />
      
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1">Nueva contraseña</label>
        <div className="relative flex items-center">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            required
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-3.5 pr-10 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 p-1 text-slate-400 hover:text-emerald-400 transition cursor-pointer select-none"
          >
            {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>
        <FieldError state={state} name="password" />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1">Confirmar contraseña</label>
        <div className="relative flex items-center">
          <input
            name="confirmPassword"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Repite la contraseña"
            required
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 pl-3.5 pr-10 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 p-1 text-slate-400 hover:text-emerald-400 transition cursor-pointer select-none"
          >
            {showConfirm ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
        </div>
        <FieldError state={state} name="confirmPassword" />
      </div>

      <div className="pt-2">
        <SubmitButton idleLabel="Actualizar contraseña" pendingLabel="Actualizando" />
      </div>
    </form>
  );
}

export function ResendVerificationForm({ defaultEmail }: { defaultEmail?: string }) {
  const [state, action] = useActionState(resendVerificationAction, INITIAL_AUTH_STATE);

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormStatus state={state} />
      <div>
        <label className="block text-xs font-bold text-slate-300 mb-1">Correo electrónico</label>
        <input
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={defaultEmail}
          placeholder="tu@correo.com"
          required
          className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
        />
        <FieldError state={state} name="email" />
      </div>
      <div className="pt-2">
        <SubmitButton idleLabel="Reenviar confirmación" pendingLabel="Enviando" />
      </div>
    </form>
  );
}
