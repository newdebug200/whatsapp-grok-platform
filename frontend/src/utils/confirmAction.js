import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

export async function confirmAction(message, options = {}) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const result = await Swal.fire({
    icon: options.icon || 'warning',
    title: options.title || 'Confirmer cette action',
    text: message,
    confirmButtonText: options.confirmButtonText || 'Confirmer',
    cancelButtonText: options.cancelButtonText || 'Annuler',
    showCancelButton: true,
    reverseButtons: true,
    focusCancel: true,
    allowOutsideClick: false,
    background: isDark ? '#16262d' : '#ffffff',
    color: isDark ? '#effffd' : '#18252d',
    customClass: {
      popup: 'botora-swal-popup',
      title: 'botora-swal-title',
      htmlContainer: 'botora-swal-text',
      confirmButton: 'botora-swal-confirm',
      cancelButton: 'botora-swal-cancel'
    },
    buttonsStyling: false
  });
  return result.isConfirmed;
}
