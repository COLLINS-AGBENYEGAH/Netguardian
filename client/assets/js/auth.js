requireAuth();

document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
  e.preventDefault();
  clearSession();
  window.location.href = 'index.html';
});
