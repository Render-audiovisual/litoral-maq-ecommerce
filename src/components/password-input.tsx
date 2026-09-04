"use client";

import { InputHTMLAttributes, useState } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  id: string;
  label: string;
};

export function PasswordInput({ id, label, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const actionLabel = visible ? "Ocultar clave" : "Ver clave";
  const actionTitle = visible ? "Ocultar contraseña" : "Mostrar contraseña";

  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <span className="password-input">
        <input {...props} id={id} type={visible ? "text" : "password"} />
        <button
          type="button"
          className="password-toggle"
          aria-label={actionLabel}
          title={actionTitle}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.8 2.8M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9 5.3 9 5.3a14.7 14.7 0 0 1-2.4 3M6.2 6.2A15.8 15.8 0 0 0 3 9.3s3.5 5.3 9 5.3a9.7 9.7 0 0 0 3.2-.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12s3.5-5.3 9-5.3 9 5.3 9 5.3-3.5 5.3-9 5.3S3 12 3 12Z" />
              <circle cx="12" cy="12" r="2.4" />
            </svg>
          )}
        </button>
      </span>
    </div>
  );
}
