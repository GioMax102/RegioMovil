import type { ReactNode } from 'react';
import { getServiceBadge, type ServiceBadgeInput } from '../data/serviceBadges';
import './serviceBadge.css';

/** Every color is paired with a visible route code and a full service name. */
export default function ServiceBadge({
  className = '',
  children,
  ...input
}: ServiceBadgeInput & { className?: string; children?: ReactNode }) {
  const identity = getServiceBadge(input);
  return (
    <span
      className={`service-badge ${className}`.trim()}
      title={`${identity.name} · ${input.code}`}
      style={{
        backgroundColor: identity.background,
        color: identity.foreground,
        borderColor: identity.background,
      }}
    >
      {children ?? input.code}
    </span>
  );
}
