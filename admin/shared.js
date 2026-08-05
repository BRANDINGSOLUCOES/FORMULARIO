// admin/shared.js
//
// Componentes reutilizáveis do painel administrativo (Etapa 7 + Etapa 8).
// Tudo exposto num único namespace global `AdminUI`, carregado via
// <script src="shared.js"></script> antes do script de cada página —
// sem build step, sem framework, mas com a lógica realmente compartilhada
// (não duplicada) entre dashboard.html e company.html.

const AdminUI = (() => {

  function escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  // Deriva um status único (Enviado / Pendente / Erro / Sem diagnóstico)
  // a partir de email_status + whatsapp_status de um diagnóstico.
  function deriveStatus(diag) {
    if (!diag) return { key: 'sem', label: 'Sem diagnóstico' };
    const sent = diag.email_status === 'enviado' || diag.whatsapp_status === 'enviado';
    if (sent) return { key: 'enviado', label: 'Enviado' };
    const errored = (diag.email_status || '').startsWith('erro') || (diag.whatsapp_status || '').startsWith('erro');
    if (errored) return { key: 'erro', label: 'Erro' };
    return { key: 'pendente', label: 'Pendente' };
  }

  // --- Componentes de UI (funções que devolvem HTML) ---

  function statusBadge(status) {
    return `<span class="badge badge-${status.key}">${escapeHtml(status.label)}</span>`;
  }

  // Componente de card: título + conteúdo (HTML já pronto).
  function card({ title, icon = '', bodyHtml, actionsHtml = '' }) {
    return `
      <div class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-bold">${icon ? `<span class="mr-1">${icon}</span>` : ''}${escapeHtml(title)}</h2>
          ${actionsHtml ? `<div class="flex items-center gap-2">${actionsHtml}</div>` : ''}
        </div>
        ${bodyHtml}
      </div>`;
  }

  // Linha "label : valor", usada dentro de cards de informação.
  function infoRow(label, value) {
    return `
      <div class="info-row">
        <span class="info-label">${escapeHtml(label)}</span>
        <span class="info-value">${value === null || value === undefined || value === '' ? '—' : escapeHtml(String(value))}</span>
      </div>`;
  }

  // Lista simples com marcador (usada em pontos fortes/fracos/oportunidades/planos).
  function bulletList(items, emptyLabel = 'Nenhum item.') {
    if (!items || items.length === 0) {
      return `<p class="text-sm" style="color:var(--slate-600);">${escapeHtml(emptyLabel)}</p>`;
    }
    return `<ul class="space-y-1.5">${items.map(i => `
      <li class="text-sm flex gap-2"><span style="color:var(--sky-400);">•</span><span>${escapeHtml(i)}</span></li>
    `).join('')}</ul>`;
  }

  function button({ label, id = '', variant = 'ghost', disabled = false, href = null }) {
    const cls = variant === 'gold' ? 'btn-gold' : variant === 'danger' ? 'btn-danger' : 'btn-ghost';
    const idAttr = id ? `id="${id}"` : '';
    if (href) {
      return `<a ${idAttr} class="${cls}" href="${href}" target="_blank" rel="noopener">${label}</a>`;
    }
    return `<button ${idAttr} class="${cls}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  }

  // Modal de confirmação reutilizável — devolve uma Promise<boolean>.
  function confirmModal({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' }) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `
        <div class="modal-card">
          <h3 class="text-base font-bold mb-2">${escapeHtml(title)}</h3>
          <p class="text-sm mb-6" style="color:var(--slate-600);">${escapeHtml(message)}</p>
          <div class="flex justify-end gap-2">
            <button class="btn-ghost" id="modalCancelBtn">${escapeHtml(cancelLabel)}</button>
            <button class="btn-danger" id="modalConfirmBtn">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);

      const cleanup = (result) => { backdrop.remove(); resolve(result); };
      backdrop.querySelector('#modalCancelBtn').addEventListener('click', () => cleanup(false));
      backdrop.querySelector('#modalConfirmBtn').addEventListener('click', () => cleanup(true));
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(false); });
    });
  }

  // Toast simples (feedback de ações como "reenviado com sucesso").
  function toast(message, tone = 'success') {
    const el = document.createElement('div');
    const bg = tone === 'error' ? 'var(--danger)' : 'var(--navy-900)';
    el.style.cssText = `position:fixed; bottom:1.5rem; left:50%; transform:translateX(-50%); background:${bg}; color:#fff; padding:0.75rem 1.25rem; border-radius:12px; font-size:0.875rem; font-weight:600; z-index:60; box-shadow:0 10px 24px -8px rgba(0,0,0,0.35);`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // Guarda de autenticação — usado por dashboard.html e company.html.
  async function requireAuth(supabaseClient, userEmailElId = 'userEmail') {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
      window.location.href = 'login.html';
      return null;
    }
    const el = document.getElementById(userEmailElId);
    if (el) el.textContent = session.user.email;
    return session;
  }

  function wireLogout(supabaseClient, buttonId = 'logoutBtn') {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
    });
  }

  return {
    escapeHtml, formatDate, formatDateTime, deriveStatus,
    statusBadge, card, infoRow, bulletList, button,
    confirmModal, toast, requireAuth, wireLogout,
  };
})();
