const $ = id => document.getElementById(id);
const STATUS = {
  DISPONIVEL: 'Disponível',
  EM_USO: 'Em Uso',
  EM_MANUTENCAO: 'Em Manutenção',
  PERDIDO: 'Perdido'
};

let items = [];
let currentMoves = [];
let warehouses = [];
let employees = [];
let movFilterMode = 'open';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

async function api(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Erro HTTP: ${response.status}`);
    }
    return data;
  } catch (error) {
    throw error;
  }
}

function showPage(p) {
  document.querySelectorAll('[id^="page-"]').forEach(e => e.classList.add('hidden'));
  const targetPage = $('page-' + p);
  if (targetPage) targetPage.classList.remove('hidden');

  document.querySelectorAll('.nav button').forEach(b =>
    b.classList.toggle('active', b.dataset.page === p)
  );

  if (p === 'mov') renderMoves();
  if (p === 'mapa') renderWarehouseMap();
  if (p === 'retirada') {
    populateWithdrawSelect();
    updateWithdrawSummary();
  }
  if (p === 'status') loadStatusCounts();
}

document.querySelectorAll('.nav button').forEach(b =>
  b.addEventListener('click', () => showPage(b.dataset.page))
);
document.querySelectorAll('[data-goto]').forEach(b =>
  b.addEventListener('click', () => showPage(b.dataset.goto))
);

async function loadItems() {
  try {
    [items, warehouses] = await Promise.all([
      api('/api/items'),
      api('/api/warehouses')
    ]);
    try {
      employees = await api('/api/employees');
      renderEmployeesDatalist();
    } catch (e) {
      showMessage(
        `Não foi possível carregar a lista de colaboradores: ${e.message}. Você ainda pode digitar a matrícula para validação.`,
        true
      );
    }
    renderWarehouseOptions();
    renderWithdrawOptions();
    const warehouseCountEl = $('warehouseCount');
    if (warehouseCountEl) warehouseCountEl.textContent = warehouses.length;
    await search(false);
  } catch (e) {
    showMessage(
      `Não foi possível carregar o banco de dados: ${e.message}. Inicie o servidor pelo arquivo iniciar.bat.`,
      true
    );
  }
}

function renderEmployeesDatalist() {
  const datalist = $('employeesDatalist');
  if (!datalist) return;
  datalist.innerHTML = employees.map(employee => `
    <option value="${esc(employee.matricula)}" label="${esc(employee.nome)}"></option>
    <option value="${esc(employee.nome)}" label="Matrícula ${esc(employee.matricula)}"></option>
  `).join('');
}

function findEmployee(value) {
  const input = String(value || '').trim();
  if (!input) return null;

  const idMatch = input.match(/^(\d+)/);
  if (idMatch) {
    const employee = employees.find(e => String(e.matricula) === idMatch[1]);
    if (employee) return employee;
  }

  const name = input.replace(/\s*[([\-–—]\s*\d+\s*\)?\s*$/, '').trim().toLocaleLowerCase();
  return employees.find(e => e.nome.trim().toLocaleLowerCase() === name) || null;
}

function resolveEmployeeMatricula(value) {
  const input = String(value || '').trim();
  const employee = findEmployee(input);
  if (employee) return String(employee.matricula);

  const idMatch = input.match(/^(\d+)(?:\s|$|[-–—])/);
  if (idMatch) return idMatch[1];
  return /^\d+$/.test(input) ? input : '';
}

function updateEmployeePreview(input, preview) {
  if (!input || !preview) return;
  const value = input.value.trim();
  const employee = findEmployee(value);
  if (employee) {
    preview.style.color = '#155e37';
    preview.textContent = `✓ Colaborador ativo: ${employee.nome} (Matrícula ${employee.matricula})`;
  } else if (value) {
    preview.style.color = '#855500';
    preview.textContent = /^\d/.test(value)
      ? 'A matrícula será validada pelo sistema ao confirmar.'
      : 'Selecione um colaborador da lista ou informe a matrícula.';
  } else {
    preview.textContent = '';
  }
}

const employeeIdInput = $('employeeId');
if (employeeIdInput) {
  employeeIdInput.addEventListener('input', () =>
    updateEmployeePreview(employeeIdInput, $('employeePreview'))
  );
}

function showMessage(message, error = false) {
  const msgEl = $('message');
  if (!msgEl) return;
  msgEl.classList.remove('hidden');
  msgEl.textContent = message;
  msgEl.style.background = error ? '#fff4e5' : '#eaf6ee';
  msgEl.style.color = error ? '#855500' : '#155e37';
}

function statusClass(i) {
  return i.status === 'Disponível' ? '' : 'warn';
}

function actionButtons(i) {
  let actions = [];
  if (i.status === 'Disponível') {
    actions = [
      ['withdraw', '↗ Retirar', 'btn-primary-act'],
      ['maintenance', '⚒ Manutenção', 'btn-maint-act'],
      ['lost', '! Marcar perdido', 'btn-lost-act']
    ];
  } else if (i.status === 'Em Uso') {
    actions = [
      ['return', '↙ Registrar devolução', 'btn-return-act'],
      ['lost', '! Marcar perdido', 'btn-lost-act']
    ];
  } else if (i.status === 'Em Manutenção') {
    actions = [['maintenance_return', '✓ Retorno da manutenção', 'btn-return-act']];
  } else if (i.status === 'Perdido') {
    actions = [['found', '✓ Item localizado', 'btn-return-act']];
  }
  return actions
    .map(([a, label, cls]) =>
      `<button type="button" class="action-btn ${cls}" data-action="${a}" data-code="${esc(i.code)}">${label}</button>`
    )
    .join(' ');
}

async function search(showNotice = true) {
  const params = new URLSearchParams();
  const q = $('q').value.trim();
  const cat = $('cat').value;
  const sector = $('sector').value;
  const status = $('status').value;
  if (q) params.set('q', q);
  if (cat) params.set('category', cat);
  if (sector) params.set('sector', sector);
  if (status) params.set('status', status);

  try {
    const found = await api('/api/items?' + params.toString());
    items = await api('/api/items');

    if (showNotice) {
      showMessage(
        found.length
          ? `${found.length} material(is) encontrado(s). Dados sincronizados com o SQLite.`
          : 'Nenhum material encontrado com esses filtros.'
      );
    }

    const box = $('results');
    if (!box) return;

    if (!found.length) {
      box.className = 'empty';
      box.innerHTML = `
        <div style="font-size:46px">⌕</div>
        <div class="empty-text">
          Nenhum material encontrado
          <div class="subtle">Altere os filtros ou verifique o termo pesquisado.</div>
        </div>`;
      return;
    }

    box.className = 'results';
    box.innerHTML = found.map(i => `
      <article class="result">
        <div>
          <div class="item-name">${esc(i.name)}</div>
          <div class="item-meta">${esc(i.code)} · ${esc(i.cat)} · ${esc(i.sector)}</div>
          <div class="item-meta">Local: ${esc(i.loc)}</div>
          ${i.employee ? `<div class="item-meta">Responsável: ${esc(i.employeeName || 'Matrícula ' + i.employee)} (${esc(i.employee)})</div>` : ''}
        </div>
        <div style="display:flex;align-items:flex-end;gap:8px;flex-direction:column;max-width:100%">
          <span class="pill ${statusClass(i)}">${esc(i.status)}</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
            <button type="button" class="action-btn btn-locate-act" data-locate="${esc(i.code)}">⌖ Ver localização</button>
            ${actionButtons(i)}
          </div>
        </div>
      </article>
    `).join('');

    box.querySelectorAll('[data-locate]').forEach(b =>
      b.addEventListener('click', () => locate(b.dataset.locate))
    );
    box.querySelectorAll('[data-action]').forEach(b =>
      b.addEventListener('click', () => openActionModal(b.dataset.code, b.dataset.action))
    );
    renderWithdrawOptions();
  } catch (e) {
    showMessage(e.message, true);
  }
}

function locate(code) {
  const i = items.find(x => x.code === code);
  if (!i) return;
  showPage('mapa');
  const shelfInfo = $('shelfInfo');
  if (shelfInfo) {
    shelfInfo.classList.remove('hidden');
    shelfInfo.textContent =
      `${i.name} (${i.code}) — Localização: ${i.loc}. Status: ${i.status}.`;
  }
  openWarehouseModal(i.galpao || i.sector);
}

const searchBtn = $('search');
if (searchBtn) searchBtn.addEventListener('click', () => search());
const qInput = $('q');
if (qInput) {
  qInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') search();
  });
}
['cat', 'sector', 'status'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('change', () => search());
});

function renderWarehouseMap() {
  const container = $('warehouses-container');
  if (!container) return;

  container.innerHTML = warehouses.map(galpao => {
    const galpaoItems = items.filter(i =>
      i.sector === galpao || (i.loc && i.loc.includes(galpao))
    );
    return `
      <div class="panel" style="display:flex;justify-content:space-between;align-items:center;background:linear-gradient(110deg,#f4f8f6,#fff)">
        <div>
          <h3>📍 ${esc(galpao)}</h3>
          <p class="subtle">${galpaoItems.length} item(ns) cadastrados neste galpão. Clique para abrir o mapa de prateleiras.</p>
        </div>
        <button class="primary open-warehouse-modal" data-galpao="${esc(galpao)}">Ver Prateleiras</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.open-warehouse-modal').forEach(btn => {
    btn.addEventListener('click', () => openWarehouseModal(btn.dataset.galpao));
  });
}

function openWarehouseModal(galpao) {
  const existingModal = $('warehouse-modal-overlay');
  if (existingModal) existingModal.remove();

  const galpaoItems = items.filter(i =>
    i.sector === galpao || (i.loc && i.loc.includes(galpao))
  );
  const nums = Array.from({ length: 12 }, (_, n) => n + 1);

  const shelfButtons = nums.map(num => {
    const pad = String(num).padStart(2, '0');
    const shelfName = 'Prateleira ' + pad;
    const hasItems = galpaoItems.some(i =>
      i.prateleira === shelfName || (i.loc && i.loc.includes(shelfName))
    );

    return `
      <button class="shelf-popup-btn" data-shelf="${esc(shelfName)}"
        style="border:1px solid ${hasItems ? '#8ab9a0' : '#dbe5e1'};background:${hasItems ? '#f1faf4' : '#f7faf8'};border-radius:10px;padding:16px;color:#173b2c;font-weight:700;cursor:pointer;text-align:left">
        <span style="font-size:18px;display:block">▤ ${esc(shelfName)}</span>
        <span style="font-size:11px;color:${hasItems ? '#08783f' : '#667a80'};margin-top:4px;display:block">
          ${hasItems ? '● Com material' : 'Vazia'}
        </span>
      </button>
    `;
  }).join('');

  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'warehouse-modal-overlay';
  modalOverlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:grid;place-items:center;z-index:1000;padding:20px';

  modalOverlay.innerHTML = `
    <div style="background:#fff;width:100%;max-width:750px;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,0.2);max-height:90vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid #e7ecea;padding-bottom:12px">
        <h2 style="margin:0;font-size:22px">📦 ${esc(galpao)} — Selecione uma Prateleira</h2>
        <button id="close-modal" class="smallbtn" style="font-size:16px;padding:4px 10px">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:20px">
        ${shelfButtons}
      </div>
      <div id="shelf-products-result" style="border-top:1px solid #e7ecea;padding-top:16px">
        <p style="color:#667a80;text-align:center">Clique em uma prateleira acima para ver os produtos cadastrados nela.</p>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  $('close-modal').addEventListener('click', () => modalOverlay.remove());
  modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) modalOverlay.remove();
  });

  modalOverlay.querySelectorAll('.shelf-popup-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const shelfName = btn.dataset.shelf;
      const matchingItems = galpaoItems.filter(i =>
        i.prateleira === shelfName ||
        (i.loc && i.loc.includes(shelfName))
      );
      const resultContainer = $('shelf-products-result');

      if (!matchingItems.length) {
        resultContainer.innerHTML =
          `<p style="color:#885800;background:#fff4e5;padding:12px;border-radius:8px;text-align:center;font-weight:600">${esc(shelfName)}: Nenhuma ferramenta ou material cadastrado nesta prateleira.</p>`;
        return;
      }

      resultContainer.innerHTML = `
        <h4 style="margin:0 0 10px;color:#12313c">Itens na ${esc(shelfName)}:</h4>
        <div style="display:grid;gap:8px">
          ${matchingItems.map(i => `
            <div style="background:#f4f8f6;border:1px solid #cde6d5;padding:10px 14px;border-radius:8px;display:flex;justify-content:space-between;align-items:center">
              <div>
                <strong>${esc(i.name)}</strong>
                <span style="font-size:12px;color:#667a80">(${esc(i.code)})</span>
                <div style="font-size:12px;color:#667a80">Caixa: ${esc(i.caixa)} · Categoria: ${esc(i.cat)}</div>
              </div>
              <span class="pill ${statusClass(i)}">${esc(i.status)}</span>
            </div>
          `).join('')}
        </div>
      `;
    });
  });
}

async function renderMoves() {
  const movesEl = $('moves');
  if (!movesEl) return;
  updateMovFilterButtons();

  try {
    [currentMoves, items] = await Promise.all([
      api('/api/movements'),
      api('/api/items')
    ]);

    if (!currentMoves.length) {
      movesEl.innerHTML = '<tr><td colspan="4">Nenhuma movimentação registrada até agora.</td></tr>';
      return;
    }

    const grouped = new Map();
    currentMoves.forEach(move => {
      const codeMatch = move.item.match(/\(([^)]+)\)$/);
      const code = codeMatch ? codeMatch[1] : move.item;
      if (!grouped.has(code)) {
        grouped.set(code, { code, itemLabel: move.item, latest: move, events: [] });
      }
      grouped.get(code).events.push(move);
    });

    let groups = Array.from(grouped.values());
    if (movFilterMode === 'open') {
      groups = groups.filter(group => {
        const item = items.find(entry => entry.code === group.code);
        return item && item.status !== 'Disponível';
      });
    }

    if (!groups.length) {
      movesEl.innerHTML =
        '<tr><td colspan="4">Nenhum material em aberto no momento. Clique em “Todos os Registros” para consultar o histórico concluído.</td></tr>';
      return;
    }

    movesEl.innerHTML = groups.map(group => {
      const item = items.find(entry => entry.code === group.code);
      const status = item ? item.status : group.latest.type;
      const isOpen = Boolean(item && item.status !== 'Disponível');
      let quickAction = '<span class="subtle">Concluído</span>';

      if (item && item.status === 'Em Uso') {
        quickAction = `
          <button type="button" class="action-btn btn-return-act"
            data-quick-action="return" data-code="${esc(item.code)}"
            data-employee="${esc(item.employee)}">↙ Registrar devolução</button>`;
      } else if (item && item.status === 'Em Manutenção') {
        quickAction = `
          <button type="button" class="action-btn btn-return-act"
            data-quick-action="maintenance_return" data-code="${esc(item.code)}">✓ Concluir manutenção</button>`;
      } else if (item && item.status === 'Perdido') {
        quickAction = `
          <button type="button" class="action-btn btn-return-act"
            data-quick-action="found" data-code="${esc(item.code)}">✓ Marcar localizado</button>`;
      } else if (item) {
        quickAction = `
          <button type="button" class="action-btn btn-primary-act"
            data-quick-action="withdraw" data-code="${esc(item.code)}">↗ Retirar novamente</button>`;
      }

      const timeline = group.events.map(event => `
        <li>
          <span><strong>${esc(event.type)}</strong> — ${esc(event.employee)}${event.note ? ` <em>(${esc(event.note)})</em>` : ''}</span>
          <span class="timeline-date">${esc(event.date)}</span>
        </li>
      `).join('');

      return `
        <tr>
          <td>
            <strong>${esc(group.itemLabel)}</strong>
            <div class="item-meta">${esc(group.latest.location)}</div>
          </td>
          <td>
            <span class="pill ${isOpen ? 'warn' : ''}">${esc(status)}</span>
            <div class="item-meta">Último registro: ${esc(group.latest.employee)} (${esc(group.latest.date)})</div>
          </td>
          <td>
            <details class="timeline-details" ${isOpen ? 'open' : ''}>
              <summary>${group.events.length} registro(s) no histórico</summary>
              <ul class="timeline-list">${timeline}</ul>
            </details>
          </td>
          <td>${quickAction}</td>
        </tr>
      `;
    }).join('');

    movesEl.querySelectorAll('[data-quick-action]').forEach(button => {
      button.addEventListener('click', () =>
        openActionModal(
          button.dataset.code,
          button.dataset.quickAction,
          button.dataset.employee || ''
        )
      );
    });
  } catch (e) {
    movesEl.innerHTML = `<tr><td colspan="4">${esc(e.message)}</td></tr>`;
  }
}

function updateMovFilterButtons() {
  const openButton = $('filterMovOpen');
  const allButton = $('filterMovAll');
  if (openButton) openButton.classList.toggle('btn-primary-act', movFilterMode === 'open');
  if (allButton) allButton.classList.toggle('btn-primary-act', movFilterMode === 'all');
}

const filterMovOpen = $('filterMovOpen');
if (filterMovOpen) {
  filterMovOpen.addEventListener('click', () => {
    movFilterMode = 'open';
    renderMoves();
  });
}
const filterMovAll = $('filterMovAll');
if (filterMovAll) {
  filterMovAll.addEventListener('click', () => {
    movFilterMode = 'all';
    renderMoves();
  });
}

const newMoveBtn = $('newMove');
if (newMoveBtn) {
  newMoveBtn.addEventListener('click', () => showPage('retirada'));
}

function renderWithdrawOptions() {
  const select = $('withdrawItem');
  if (!select) return;
  const selected = select.value;
  const available = items.filter(i => i.status === 'Disponível');
  select.innerHTML = available.map(i =>
    `<option value="${esc(i.code)}">${esc(i.code)} — ${esc(i.name)}</option>`
  ).join('') || '<option value="">Nenhum material disponível</option>';
  if (available.some(i => i.code === selected)) select.value = selected;
}

function renderWarehouseOptions() {
  const select = $('sector');
  if (!select) return;
  const selected = select.value;
  select.innerHTML =
    '<option value="">⚑ Setor: todos</option>' +
    warehouses.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  if (warehouses.includes(selected)) select.value = selected;
}

function populateWithdrawSelect() {
  renderWithdrawOptions();
}

function updateWithdrawSummary() {
  const itemVal = $('withdrawItem')?.value;
  const i = items.find(x => x.code === itemVal);
  const infoEl = $('withdrawItemInfo');
  const sumEl = $('withdrawSummary');

  if (!i) {
    if (infoEl) infoEl.textContent = 'Nenhum material disponível no cadastro.';
    if (sumEl) sumEl.textContent = 'Cadastre um material no banco para começar.';
    return;
  }
  if (infoEl) {
    infoEl.textContent =
      `${i.code} · ${i.cat} · ${i.sector} · Status atual: ${i.status}`;
  }
  if (sumEl) {
    sumEl.textContent =
      `${i.name} — ${i.loc}. Status: ${i.status}${i.employee ? ' · Matrícula responsável: ' + i.employee : ''}.`;
  }
}

const withdrawItemEl = $('withdrawItem');
if (withdrawItemEl) {
  withdrawItemEl.addEventListener('change', () => {
    const wNotice = $('withdrawNotice');
    if (wNotice) wNotice.classList.add('hidden');
    updateWithdrawSummary();
  });
}

async function confirmWithdrawal() {
  const code = $('withdrawItem')?.value;
  const matricula = resolveEmployeeMatricula($('employeeId')?.value);
  const wNotice = $('withdrawNotice');
  if (wNotice) wNotice.classList.remove('hidden');

  if (!matricula) {
    if (wNotice) {
      wNotice.style.background = '#fff4e5';
      wNotice.style.color = '#855500';
      wNotice.textContent = 'Selecione um colaborador da lista ou informe uma matrícula válida.';
    }
    return;
  }

  try {
    const result = await api(`/api/items/${encodeURIComponent(code)}/action`, {
      method: 'POST',
      body: JSON.stringify({ action: 'withdraw', matricula })
    });
    if (wNotice) {
      wNotice.style.background = '#eaf6ee';
      wNotice.style.color = '#155e37';
      wNotice.textContent =
        `Retirada confirmada! ${result.item.name} (${result.item.code}) agora está “${result.item.status}”. Colaborador: ${result.item.employeeName} (${matricula}).`;
    }
    const empId = $('employeeId');
    if (empId) empId.value = '';
    const employeePreview = $('employeePreview');
    if (employeePreview) employeePreview.textContent = '';
    await refreshAll();
  } catch (e) {
    if (wNotice) {
      wNotice.style.background = '#fff4e5';
      wNotice.style.color = '#855500';
      wNotice.textContent = e.message;
    }
  }
}

const confirmWithdrawBtn = $('confirmWithdraw');
if (confirmWithdrawBtn) {
  confirmWithdrawBtn.addEventListener('click', confirmWithdrawal);
}

function openActionModal(code, action, defaultMatricula = '') {
  const existing = $('action-modal-overlay');
  if (existing) existing.remove();

  const item = items.find(entry => entry.code === code);
  const labels = {
    withdraw: 'Retirar material',
    return: 'Registrar devolução',
    maintenance: 'Enviar à manutenção',
    maintenance_return: 'Retorno da manutenção',
    lost: 'Marcar item como perdido',
    found: 'Registrar item localizado'
  };

  const overlay = document.createElement('div');
  overlay.id = 'action-modal-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="action-modal" role="dialog" aria-modal="true" aria-labelledby="actionModalTitle">
      <div class="action-modal-head">
        <h3 id="actionModalTitle">${esc(labels[action] || 'Registrar ação')}</h3>
        <button type="button" id="closeActionModal" class="smallbtn" aria-label="Fechar">✕</button>
      </div>
      <p class="action-modal-item">Material: <strong>${esc(item ? item.name : code)}</strong> (${esc(code)})</p>
      <div class="field">
        <label for="modalMatricula">Matrícula do colaborador</label>
        <input id="modalMatricula" list="employeesDatalist" value="${esc(defaultMatricula)}"
          placeholder="Digite a matrícula ou o nome..." autocomplete="off">
        <div id="modalEmployeePreview" class="item-meta"></div>
      </div>
      <div class="field">
        <label for="modalObs">Observação (opcional)</label>
        <input id="modalObs" placeholder="Ex.: entregue limpo e conferido">
      </div>
      <div id="modalActionError" class="notice hidden action-modal-error" role="alert"></div>
      <div class="action-modal-buttons">
        <button type="button" id="cancelActionModal" class="smallbtn">Cancelar</button>
        <button type="button" id="submitActionModal" class="primary">Confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#closeActionModal').addEventListener('click', close);
  overlay.querySelector('#cancelActionModal').addEventListener('click', close);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) close();
  });

  const matriculaInput = overlay.querySelector('#modalMatricula');
  const preview = overlay.querySelector('#modalEmployeePreview');
  matriculaInput.addEventListener('input', () => updateEmployeePreview(matriculaInput, preview));
  updateEmployeePreview(matriculaInput, preview);
  matriculaInput.focus();

  overlay.querySelector('#submitActionModal').addEventListener('click', async () => {
    const matricula = resolveEmployeeMatricula(matriculaInput.value);
    const errorBox = overlay.querySelector('#modalActionError');
    if (!matricula) {
      errorBox.textContent = 'Selecione um colaborador da lista ou informe uma matrícula válida.';
      errorBox.classList.remove('hidden');
      return;
    }

    try {
      const result = await api(`/api/items/${encodeURIComponent(code)}/action`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          matricula,
          observacao: overlay.querySelector('#modalObs').value.trim()
        })
      });
      close();
      showMessage(`${result.message} ${result.item.name}: ${result.item.status}.`);
      const moveNotice = $('moveNotice');
      if (moveNotice && !$('page-mov').classList.contains('hidden')) {
        moveNotice.classList.remove('hidden');
        moveNotice.textContent = `${result.message} ${result.item.name} (${result.item.code}).`;
      }
      await refreshAll();
    } catch (e) {
      errorBox.textContent = e.message;
      errorBox.classList.remove('hidden');
    }
  });
}

async function loadStatusCounts() {
  try {
    const statuses = await api('/api/statuses');
    document.querySelectorAll('#page-status .status-list .panel').forEach(card => {
      const label = card.querySelector('h3')?.textContent?.trim();
      const match = statuses.find(s => s.label === label);
      if (match) {
        const badge = card.querySelector('.pill');
        if (badge) badge.textContent = `${match.total} item(ns)`;
      }
    });
  } catch (e) {
    console.warn(e);
  }
}

async function refreshAll() {
  items = await api('/api/items');
  renderWithdrawOptions();
  updateWithdrawSummary();
  await search(false);

  const pageMov = $('page-mov');
  const pageStatus = $('page-status');
  const pageMapa = $('page-mapa');

  if (pageMov && !pageMov.classList.contains('hidden')) await renderMoves();
  if (pageStatus && !pageStatus.classList.contains('hidden')) await loadStatusCounts();
  if (pageMapa && !pageMapa.classList.contains('hidden')) renderWarehouseMap();
}

loadItems();
