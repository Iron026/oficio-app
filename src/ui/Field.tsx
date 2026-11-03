import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

const control =
  'w-full rounded-xl border bg-surface px-3.5 text-base text-fg placeholder:text-muted/70 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25';

interface Wrap { label: string; error?: string; hint?: string; children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode; optional?: boolean }

function FieldWrap({ label, error, hint, children, optional }: Wrap) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label} {optional && <span className="font-normal text-muted">(opcional)</span>}
      </label>
      {children({ id, describedBy: error || hint ? msgId : undefined, invalid: !!error })}
      {error ? (
        <p id={msgId} role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p id={msgId} className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

type Common = { label: string; error?: string; hint?: string; optional?: boolean };

export function TextField({ label, error, hint, optional, className, prefix, ...rest }: Common & InputHTMLAttributes<HTMLInputElement> & { prefix?: string }) {
  return (
    <FieldWrap label={label} error={error} hint={hint} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          {prefix && <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-base text-muted">{prefix}</span>}
          <input
            id={id}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={cx(control, 'h-12', prefix && 'pl-10', invalid ? 'border-red-500' : 'border-line', className)}
            {...rest}
          />
        </div>
      )}
    </FieldWrap>
  );
}

export function TextArea({ label, error, hint, optional, className, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldWrap label={label} error={error} hint={hint} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          rows={3}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cx(control, 'py-3 resize-none', invalid ? 'border-red-500' : 'border-line', className)}
          {...rest}
        />
      )}
    </FieldWrap>
  );
}

export function SelectField({ label, error, hint, optional, className, children, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldWrap label={label} error={error} hint={hint} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cx(control, 'h-12 appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10', invalid ? 'border-red-500' : 'border-line', className)}
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
          {...rest}
        >
          {children}
        </select>
      )}
    </FieldWrap>
  );
}
