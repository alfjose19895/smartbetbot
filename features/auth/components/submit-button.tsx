"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
};

export function SubmitButton({ idleLabel, pendingLabel }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button className="auth-submit" type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? (
        <>
          <span className="button-spinner" aria-hidden="true" /> {pendingLabel}
        </>
      ) : (
        <>
          {idleLabel} <span aria-hidden="true">→</span>
        </>
      )}
    </button>
  );
}
