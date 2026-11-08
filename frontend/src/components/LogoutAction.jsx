import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function LogoutAction({ className, label = 'Logout', redirectTo = '/login', title }) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef(null);
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [isOpen]);

  const confirmLogout = () => {
    logout();
    navigate(redirectTo, { replace: true, state: { notice: 'You have been logged out.' } });
  };

  return (
    <>
      <button type="button" className={className} title={title} aria-label={label} onClick={() => setIsOpen(true)}>
        <LogOut size={18} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {isOpen && (
        <dialog
          ref={dialogRef}
          className="logout-dialog"
          aria-labelledby="logout-dialog-title"
          onCancel={(event) => { event.preventDefault(); setIsOpen(false); }}
          onClose={() => setIsOpen(false)}
        >
          <h2 id="logout-dialog-title">Log out?</h2>
          <p>Are you sure you want to log out?</p>
          <div className="logout-dialog-actions">
            <button type="button" className="btn btn-white" autoFocus onClick={() => setIsOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={confirmLogout}>Logout</button>
          </div>
        </dialog>
      )}
    </>
  );
}