/** Local artwork: representative transit silhouettes, without claiming a fleet model. */
export default function TransportIllustration({ kind }: { kind: 'metro' | 'bus' }) {
  return (
    <svg
      viewBox="0 0 112 112"
      aria-hidden="true"
      focusable="false"
      className="transport-illustration"
    >
      <circle cx="56" cy="56" r="54" fill="var(--soft)" />
      <path d="M12 86h88M20 93h72" stroke="var(--green)" strokeWidth="1.5" opacity=".16" />
      {kind === 'metro' ? (
        <>
          <path
            d="m40 87-7 13m39-13 7 13M35 95h42"
            stroke="var(--green)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path d="M32 30q0-13 24-13t24 13v48q0 10-10 10H42q-10 0-10-10Z" fill="var(--green)" />
          <path d="M36 32q0-8 20-8t20 8v26H36Z" fill="var(--white)" />
          <path d="M40 34q0-5 16-5t16 5v18H40Z" fill="#1b4d42" />
          <path d="M56 29v23M43 63h26" stroke="var(--green)" strokeWidth="3" />
          <path d="m42 34 9-3-8 18h-3Z" fill="white" opacity=".16" />
          <path d="M35 70h42v7H35Z" fill="var(--white)" opacity=".85" />
          <circle cx="42" cy="73" r="3" fill="#e7b75a" />
          <circle cx="70" cy="73" r="3" fill="#e7b75a" />
          <path
            d="M47 20h18"
            stroke="var(--white)"
            opacity=".6"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect x="47" y="80" width="18" height="3" rx="1.5" fill="#163e32" />
        </>
      ) : (
        <>
          <path d="M20 35q0-8 9-8h54q10 0 10 10v41H20Z" fill="var(--green)" />
          <path d="M25 35h54v23H25ZM83 35h4q2 0 2 3v20h-6Z" fill="#1b4d42" />
          <path d="M38 35v23m14-23v23m14-23v23" stroke="var(--green)" strokeWidth="2.5" />
          <path d="m29 35 10 0-11 20h-3V42Z" fill="white" opacity=".16" />
          <path d="M20 63h73v9H20Z" fill="var(--white)" opacity=".9" />
          <path d="M70 58v20m12-20v20" stroke="#174735" strokeWidth="2" />
          <path d="M18 78h77" stroke="#174735" strokeWidth="3" strokeLinecap="round" />
          <circle cx="34" cy="79" r="9" fill="#203c31" />
          <circle cx="79" cy="79" r="9" fill="#203c31" />
          <circle cx="34" cy="79" r="4" fill="#d6e7dd" />
          <circle cx="79" cy="79" r="4" fill="#d6e7dd" />
          <path
            d="M93 44h4v13"
            fill="none"
            stroke="var(--green)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect x="88" y="65" width="5" height="4" rx="1" fill="#e7b75a" />
        </>
      )}
    </svg>
  );
}
