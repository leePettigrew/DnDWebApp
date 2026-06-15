import type { SVGProps } from "react";

/**
 * Bespoke line icons drawn to fit the Candlelit Scriptorium look — inked,
 * slightly heraldic. All use `currentColor` so they inherit text color, and
 * accept a className for sizing. Decorative by default (aria-hidden); pass a
 * `title`/`aria-label` at the call site when an icon is meaningful on its own.
 */
type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function D20Icon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 2.5 21 7.5v9L12 21.5 3 16.5v-9z" />
      <path d="M12 2.5 7 9h10z" />
      <path d="M7 9l-4-1.5M17 9l4-1.5M7 9v6l5 3.5 5-3.5V9M7 15l-4 1.5M17 15l4 1.5M12 18.5V21.5" />
      <path d="M12 9v3" />
    </Base>
  );
}

export function DiceIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function ScrollIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 4h11a2 2 0 0 1 2 2v11" />
      <path d="M8 4a2 2 0 0 0-2 2v10a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-1h6" />
      <path d="M19 17a2 2 0 0 1-2 2H6" />
      <path d="M9 8h7M9 11h7" />
    </Base>
  );
}

export function HelmIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 10a7 7 0 0 1 14 0v4a2 2 0 0 1-2 2h-1l-1 3H9l-1-3H7a2 2 0 0 1-2-2z" />
      <path d="M12 6v10M5 11h14" />
    </Base>
  );
}

export function ClawIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 3c1 4 1.5 7 1.5 9.5M9.5 3c.5 4 .5 7 .3 9.7M14 3.2c0 4-.3 7-.8 9.6M18.5 4c-.6 3.8-1.4 6.6-2.4 9" />
      <path d="M4 13c1.5 5 5 8 8 8s6.5-2 8-7" />
    </Base>
  );
}

export function SwordsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14.5 4H20v5.5l-9 9-2.5-2.5z" />
      <path d="M9.5 4H4v5.5l9 9 2.5-2.5" />
      <path d="M4 18l2 2M20 18l-2 2M6.5 17.5 4 20M17.5 17.5 20 20" />
    </Base>
  );
}

export function SwordIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14.5 3H21v6.5L10 20.5l-2-2z" />
      <path d="M8 18.5 3.5 23M6.5 17 3 20.5M9.5 19.5 6 23" />
    </Base>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 6c-1.8-1.3-4-2-6.5-2H4v14h1.5c2.5 0 4.7.7 6.5 2 1.8-1.3 4-2 6.5-2H20V4h-1.5C16 4 13.8 4.7 12 6z" />
      <path d="M12 6v14" />
    </Base>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 7a3.5 3.5 0 0 1 7 3.5C19 15.5 12 20 12 20z" />
    </Base>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3l7 2.5v5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5v-5z" />
      <path d="M12 7v8" />
    </Base>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 12h14" />
    </Base>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Base>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </Base>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Base>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 5l7 7-7 7" />
    </Base>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Base>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  );
}

export function MapIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </Base>
  );
}

export function FeatherIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20 4C9 4 5 12 5 17l-2 3M20 4c0 7-4 11-9 11H6" />
      <path d="M16 8l-6 6" />
    </Base>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </Base>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </Base>
  );
}
