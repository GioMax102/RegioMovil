import { Check } from 'lucide-react';

/** Mount with a new key for each completed action to replay the brief confirmation. */
export function ActionFeedback({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="toast action-feedback" role="status" aria-atomic="true">
      <span className="action-feedback-icon" aria-hidden="true">
        <Check size={18} />
      </span>
      <span>{message}</span>
    </div>
  );
}
