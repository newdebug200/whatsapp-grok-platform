import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

const recentAlerts = new Map();

export function showUserAlert({
  title = 'Information',
  text,
  icon = 'info',
  dedupeKey,
  dedupeMs = 5000,
  timer
}) {
  if (!text) return Promise.resolve();

  if (dedupeKey) {
    const now = Date.now();
    if (now - (recentAlerts.get(dedupeKey) || 0) < dedupeMs) return Promise.resolve();
    recentAlerts.set(dedupeKey, now);
    if (recentAlerts.size > 100) recentAlerts.delete(recentAlerts.keys().next().value);
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return Swal.fire({
    icon,
    title,
    text,
    timer,
    timerProgressBar: Boolean(timer),
    confirmButtonText: 'Compris',
    background: isDark ? '#16262d' : '#ffffff',
    color: isDark ? '#effffd' : '#18252d',
    customClass: {
      popup: 'botora-swal-popup',
      title: 'botora-swal-title',
      htmlContainer: 'botora-swal-text',
      confirmButton: 'botora-swal-confirm'
    },
    buttonsStyling: false
  });
}
