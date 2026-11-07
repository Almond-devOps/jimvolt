import { BadgeCheck } from 'lucide-react';

export default function VerifiedBusinessBadge({ verified, className = '' }) {
  if (!verified) return null;
  return (
    <span className={`verified-business-badge ${className}`.trim()} title="Verified Business" aria-label="Verified Business">
      <BadgeCheck size={16} aria-hidden="true" />
      <span>Verified Business</span>
    </span>
  );
}
