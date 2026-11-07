export default function ConfirmDialog({ question, onConfirm, onCancel }) {
  return (
    <div className="confirm" role="dialog" aria-label="Confirm command">
      <span>{question}</span>
      <button type="button" className="confirm-yes" onClick={onConfirm}>
        Confirm
      </button>
      <button type="button" className="confirm-no" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
