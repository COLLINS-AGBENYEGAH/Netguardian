requireAuth();

document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
  e.preventDefault();
  clearSession();
  window.location.href = 'index.html';
});

// --- Auto-logout on inactivity ---
// Protects an unattended, still-logged-in session (e.g. someone stepping
// away from a shared or public computer) by signing the user out after a
// period of no interaction at all. Only runs on pages that load this
// file (i.e. pages already behind requireAuth()) - never on the
// login/register page itself, since there's no session to expire there.

const IDLE_TIMEOUT_MS = 15 * 1000; // 15 minutes
let idleTimer = null;

function handleIdleLogout() {
  clearSession();
  // A flag read by index.html to show a clear reason for the logout,
  // rather than the person just landing back on the login page confused
  // about why they were signed out.
  sessionStorage.setItem('ng_idle_logout', '1');
  window.location.href = 'index.html';
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(handleIdleLogout, IDLE_TIMEOUT_MS);
}

['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach((eventName) => {
  document.addEventListener(eventName, resetIdleTimer, { passive: true });
});

resetIdleTimer();
