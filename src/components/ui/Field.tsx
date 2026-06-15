import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

const controlClasses =
  "w-full rounded-md border border-parchment-400/80 bg-parchment-50/80 px-3 py-2 text-ink shadow-inner placeholder:text-ink-faint/70 focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40 transition-colors";

function Label({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <label
        htmlFor={htmlFor}
        className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft"
      >
        {children}
      </label>
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, hint, className, id, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <div>
        {label && (
          <Label htmlFor={fieldId} hint={hint}>
            {label}
          </Label>
        )}
        <input
          ref={ref}
          id={fieldId}
          className={cn(controlClasses, className)}
          {...props}
        />
      </div>
    );
  },
);
TextField.displayName = "TextField";

interface NumberFieldProps extends Omit<TextFieldProps, "type"> {}

export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(
  (props, ref) => (
    <TextField
      ref={ref}
      type="number"
      inputMode="numeric"
      className={cn("numerals", props.className)}
      {...props}
    />
  ),
);
NumberField.displayName = "NumberField";

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, hint, className, id, rows = 4, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <div>
        {label && (
          <Label htmlFor={fieldId} hint={hint}>
            {label}
          </Label>
        )}
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          className={cn(controlClasses, "resize-y leading-relaxed", className)}
          {...props}
        />
      </div>
    );
  },
);
TextArea.displayName = "TextArea";

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, hint, className, id, children, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <div>
        {label && (
          <Label htmlFor={fieldId} hint={hint}>
            {label}
          </Label>
        )}
        <select
          ref={ref}
          id={fieldId}
          className={cn(controlClasses, "cursor-pointer", className)}
          {...props}
        >
          {children}
        </select>
      </div>
    );
  },
);
SelectField.displayName = "SelectField";
