import { PackageOpen } from 'lucide-react';

/** Reusable empty state: say what is missing and what to do next. */
export default function EmptyState({ title, text, action }) {
  return (
    <div className="empty">
      <PackageOpen size={40} aria-hidden="true" />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
