import { useEffect } from 'react';

// Closes a dropdown/menu when the user clicks outside its container or
// presses Escape. Shared by every header menu (categories, notifications,
// messages, wishlist, language, user) so they all dismiss consistently.
export default function useDismiss(ref, isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose, ref]);
}
