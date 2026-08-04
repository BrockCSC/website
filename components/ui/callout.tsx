import type { JSX } from "react";

type CalloutType = "warning" | "error" | "success" | "info";

const CALLOUT_STYLES: Record<
  CalloutType,
  {
    bg: string;
    border: string;
    text: string;
    icon: () => JSX.Element;
    label: string;
  }
> = {
  warning: {
    bg: "bg-yellow-100",
    border: "border-yellow-600",
    text: "text-yellow-800",
    icon: () => <ExclamationIcon className="stroke-yellow-600" />,
    label: "Note",
  },
  error: {
    bg: "bg-red-100",
    border: "border-red-600",
    text: "text-red-800",
    icon: () => <CrossIcon className="stroke-red-600" />,
    label: "Error",
  },
  success: {
    bg: "bg-green-100",
    border: "border-green-600",
    text: "text-green-800",
    icon: () => <CheckIcon className="stroke-green-600" />,
    label: "Success",
  },
  info: {
    bg: "bg-blue-100",
    border: "border-blue-600",
    text: "text-blue-800",
    icon: () => <ExclamationIcon className="stroke-blue-600" />,
    label: "Info",
  },
};

export default function Callout({
  message,
  type = "warning",
}: {
  message: string;
  type?: CalloutType;
}) {
  const style = CALLOUT_STYLES[type];
  const Icon = style.icon;

  return (
    <div
      className={`${style.bg} ${style.border} ${style.text} border rounded-lg p-4 flex flex-row m-4 gap-2`}
    >
      <div>
        <Icon />
      </div>
      <div className="italic">
        {style.label}: {message}
      </div>
    </div>
  );
}

function ExclamationIcon({ className }: { className: string }) {
  return (
    <svg
      width="25px"
      height="25px"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
        d="M15.12 4.623a1 1 0 011.76 0l11.32 20.9A1 1 0 0127.321 27H4.679a1 1 0 01-.88-1.476l11.322-20.9zM16 18v-6"
      />
      <path d="M17.5 22.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    </svg>
  );
}

function CrossIcon({ className }: { className: string }) {
  return (
    <svg
      width="25px"
      height="25px"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <g strokeWidth="20" strokeLinecap="round" strokeLinejoin="round">
        <g fill="none">
          <circle cx="256" cy="256" r="246" />
          <line x1="371.47" x2="140.53" y1="140.53" y2="371.47" />
          <line x1="371.47" x2="140.53" y1="371.47" y2="140.53" />
        </g>
      </g>
    </svg>
  );
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg
      width="25px"
      height="25px"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <g strokeWidth="20" strokeLinecap="round" strokeLinejoin="round">
        <g fill="none">
          <circle cx="256" cy="256" r="246" />
          <polyline points="352.14 169.14 217.07 296.57 159.86 239.29" />
        </g>
      </g>
    </svg>
  );
}
