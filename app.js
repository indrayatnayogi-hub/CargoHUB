const STATUS = ['Booking', 'Space confirm', 'Utilized', 'Cancelled'];
const VIEW_FILTERS = {
  booking: ['Booking', 'Space confirm'],
  monitoring: ['Utilized'],
  cancelled: ['Cancelled'],
};
const OFFLINE_AIRLINES = ['CX', 'EY', 'QR', 'TK'];
const FALLBACK_ROUTINGS = [
  { code: 'CX', routing: 'CGK-HKG' },
  { code: 'EY', routing: 'CGK-AUH' },
  { code: 'QR', routing: 'CGK-DOH' },
  { code: 'TK', routing: 'CGK-IST' },
  { code: 'CX', routing: 'HKG-NRT' },
  { code: 'CX', routing: 'HKG-ICN' },
  { code: 'EY', routing: 'AUH-MAD' },
  { code: 'EY', routing: 'AUH-LHR' },
  { code: 'QR', routing: 'DOH-BCN' },
  { code: 'QR', routing: 'DOH-CDG' },
  { code: 'TK', routing: 'IST-LHR' },
  { code: 'TK', routing: 'IST-CDG' },
];
const FALLBACK_FLIGHTS = ['CX780', 'CX520', 'EY475', 'EY101', 'QR955', 'QR137', 'TK57', 'TK1981'];

const state = {
  currentView: 'booking',
  shipments: [],
  routings: [],
  flights: [],
  agents: [],
  supabase: null,
  search: '',
};

const elements = {
  warning: document.querySelector('#config-warning'),
  message: document.querySelector('#app-message'),
  table: document.querySelector('#shipments-table'),
  empty: document.querySelector('#empty-state'),
  tabs: document.querySelectorAll('.view-tab'),
  search: document.querySelector('#search-input'),
  refresh: document.querySelector('#refresh-data'),
  modal: document.querySelector('#booking-modal'),
  form: document.querySelector('#booking-form'),
  openModal: document.querySelector('#open-booking-modal'),
  closeModal: document.querySelector('#close-booking-modal'),
  cancelBooking: document.querySelector('#cancel-booking'),
  leg1Routing: document.querySelector('#leg1-routing'),
  leg2Routing: document.querySelector('#leg2-routing'),
  agentSuggestions: document.querySelector('#agent-suggestions'),
  totalRevenue: document.querySelector('#total-revenue'),
  totalCost: document.querySelector('#total-cost'),
  statActive: document.querySelector('#stat-active'),
  statUtilized: document.querySelector('#stat-utilized'),
  statCancelled: document.querySelector('#stat-cancelled'),
};

function getConfig() {
  return window.CARGOHUB_CONFIG || {
    SUPABASE_URL: window.SUPABASE_URL,
    SUPABASE_ANON_KEY: window.SUPABASE_ANON_KEY,
  };
}

function initSupabase() {
  const config = getConfig();
  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY || config.SUPABASE_URL.includes('your-project')) {
    elements.warning.classList.remove('hidden');
    elements.warning.textContent = 'Supabase belum dikonfigurasi. Copy config.example.js ke config.js lalu isi SUPABASE_URL dan SUPABASE_ANON_KEY, atau generate config.js dari GitHub Pages secret saat deploy.';
    return null;
  }
  return window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
}

function showMessage(text, type = 'success') {
  elements.message.className = `mt-5 rounded-2xl p-4 text-sm ${type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`;
  elements.message.textContent = text;
  elements.message.classList.remove('hidden');
  window.setTimeout(() => elements.message.classList.add('hidden'), 4000);
}

async function fetchTable(table, columns = '*') {
  if (!state.supabase) return [];
  const { data, error } = await state.supabase.from(table).select(columns);
  if (error) throw error;
  return data || [];
}

async function loadReferenceData() {
  try {
    const [routings, flights, agents] = await Promise.all([
      fetchTable('master_routings'),
      fetchTable('master_flights'),
      fetchTable('cargo_shipments', 'agent_name'),
    ]);
    state.routings = routings.length ? routings : FALLBACK_ROUTINGS;
    state.flights = flights.length ? flights : FALLBACK_FLIGHTS.map((flight_number) => ({ flight_number }));
    state.agents = [...new Set(agents.map((item) => item.agent_name).filter(Boolean))].sort();
  } catch (error) {
    console.warn('Using fallback reference data:', error.message);
    state.routings = FALLBACK_ROUTINGS;
    state.flights = FALLBACK_FLIGHTS.map((flight_number) => ({ flight_number }));
  }
  renderRoutingOptions();
  renderFlightOptions();
  renderAgentSuggestions();
}

async function loadShipments() {
  if (!state.supabase) {
    state.shipments = [];
    render();
    return;
  }
  try {
    const { data, error } = await state.supabase.from('cargo_shipments').select('*').order('booking_date', { ascending: false });
    if (error) throw error;
    state.shipments = data || [];
    state.agents = [...new Set(state.shipments.map((item) => item.agent_name).filter(Boolean))].sort();
    renderAgentSuggestions();
    render();
  } catch (error) {
    showMessage(`Gagal memuat data: ${error.message}`, 'error');
  }
}

function routingText(item) {
  return item.routing || item.route || item.routing_code || `${item.origin || ''}-${item.destination || item.dest || ''}`.replace(/^-|-$/g, '');
}

function routingCode(item) {
  return item.airline_code || item.code || item.offline_airline || item.carrier || '';
}

function routingOrigin(item) {
  const text = routingText(item);
  return item.origin || text.split('-')[0] || '';
}

function routingDestination(item) {
  const text = routingText(item);
  return item.destination || item.dest || text.split('-')[1] || '';
}

function renderRoutingOptions() {
  const leg1 = state.routings.filter((item) => OFFLINE_AIRLINES.includes(routingCode(item)) && routingOrigin(item) === 'CGK');
  elements.leg1Routing.innerHTML = '<option value="">Select Leg 1 routing</option>' + leg1.map((item) => optionHtml(routingText(item), `${routingCode(item)} (${routingText(item)})`)).join('');
  renderLeg2Options();
}

function renderLeg2Options() {
  const leg1Value = elements.leg1Routing.value;
  const destination = leg1Value ? leg1Value.split('-')[1] : '';
  const leg2 = destination ? state.routings.filter((item) => routingOrigin(item) === destination) : [];
  elements.leg2Routing.innerHTML = leg2.length
    ? '<option value="">Select Leg 2 routing</option>' + leg2.map((item) => optionHtml(routingText(item), `${routingCode(item)} (${routingText(item)})`)).join('')
    : '<option value="">Select Leg 1 first</option>';
}

function renderFlightOptions() {
  const options = '<option value="">Select flight</option>' + state.flights.map((item) => {
    const number = item.flight_number || item.flight || item.number || item.code || item;
    return optionHtml(number, number);
  }).join('');
  document.querySelectorAll('.flight-select').forEach((select) => {
    select.innerHTML = options;
  });
}

function renderAgentSuggestions() {
  elements.agentSuggestions.innerHTML = state.agents.map((agent) => optionHtml(agent, agent)).join('');
}

function optionHtml(value, label) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
}

function render() {
  renderTabs();
  renderStats();
  const rows = filteredShipments();
  elements.table.innerHTML = rows.map(renderShipmentRow).join('');
  elements.empty.classList.toggle('hidden', rows.length > 0);
  elements.table.closest('table').classList.toggle('hidden', rows.length === 0);
  if (rows.length === 0) {
    elements.empty.querySelector('p').textContent = state.currentView === 'booking' ? 'No active bookings' : `No ${state.currentView} cargo`;
  }
}

function renderTabs() {
  elements.tabs.forEach((tab) => {
    const isActive = tab.dataset.view === state.currentView;
    tab.classList.toggle('bg-white', isActive);
    tab.classList.toggle('text-brand-700', isActive);
    tab.classList.toggle('shadow-sm', isActive);
    tab.classList.toggle('text-slate-600', !isActive);
  });
}

function renderStats() {
  elements.statActive.textContent = state.shipments.filter((item) => VIEW_FILTERS.booking.includes(item.status)).length;
  elements.statUtilized.textContent = state.shipments.filter((item) => VIEW_FILTERS.monitoring.includes(item.status)).length;
  elements.statCancelled.textContent = state.shipments.filter((item) => VIEW_FILTERS.cancelled.includes(item.status)).length;
}

function filteredShipments() {
  const statuses = VIEW_FILTERS[state.currentView];
  const query = state.search.toLowerCase();
  return state.shipments.filter((item) => {
    const matchesView = statuses.includes(item.status);
    const haystack = [item.airline, item.mawb, item.agent_name, item.gate, item.dest, item.leg1_routing, item.leg2_routing, item.leg3_routing, item.last_leg_routing].join(' ').toLowerCase();
    return matchesView && (!query || haystack.includes(query));
  });
}

function renderShipmentRow(item) {
  const id = item.id || item.mawb;
  const legs = [1, 2, 3].map((leg) => formatLeg(item[`leg${leg}_routing`], item[`leg${leg}_flight_number`], item[`leg${leg}_etd`])).filter(Boolean);
  const lastLeg = formatLeg(item.last_leg_routing, item.last_leg_flight_number, item.last_leg_etd);
  if (lastLeg) legs.push(lastLeg);
  return `
    <tr class="align-top transition hover:bg-slate-50">
      <td class="px-4 py-4 font-semibold text-slate-900">${escapeHtml(item.airline)}</td>
      <td class="px-4 py-4 whitespace-nowrap text-slate-600">${formatDate(item.booking_date)}</td>
      <td class="px-4 py-4">${renderStatusSelect(id, item.status)}</td>
      <td class="px-4 py-4 font-mono text-xs text-slate-700">${escapeHtml(item.mawb)}</td>
      <td class="px-4 py-4 text-slate-700">${escapeHtml(item.agent_name)}</td>
      <td class="px-4 py-4"><span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">${escapeHtml(item.gate)}</span></td>
      <td class="px-4 py-4 font-semibold text-slate-700">${escapeHtml(item.dest)}</td>
      <td class="px-4 py-4 text-xs text-slate-600">${legs.length ? legs.join('<br>') : '-'}</td>
      <td class="px-4 py-4 text-right font-semibold text-emerald-700">${formatCurrency(item.total_revenue)}</td>
      <td class="px-4 py-4 text-right font-semibold text-rose-700">${formatCurrency(item.total_cost)}</td>
    </tr>`;
}

function renderStatusSelect(id, currentStatus) {
  return `<select data-id="${escapeHtml(id)}" class="status-select rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-blue-100">
    ${STATUS.map((status) => `<option value="${status}" ${status === currentStatus ? 'selected' : ''}>${status}</option>`).join('')}
  </select>`;
}

function formatLeg(routing, flight, etd) {
  if (!routing && !flight && !etd) return '';
  return `<span class="font-semibold text-slate-800">${escapeHtml(routing || '-')}</span> · ${escapeHtml(flight || '-')} · ${formatDate(etd)}`;
}

function formatDate(value) {
  if (!value) return '-';
  const dateValue = String(value).includes('T') ? value : `${value}T00:00:00`;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(dateValue));
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function updateStatus(id, status) {
  const shipment = state.shipments.find((item) => String(item.id || item.mawb) === String(id));
  if (!shipment || !state.supabase) return;
  const key = shipment.id ? 'id' : 'mawb';
  const { error } = await state.supabase.from('cargo_shipments').update({ status }).eq(key, shipment[key]);
  if (error) {
    showMessage(`Gagal update status: ${error.message}`, 'error');
    render();
    return;
  }
  shipment.status = status;
  showMessage(`Status MAWB ${shipment.mawb} diubah ke ${status}.`);
  render();
}

function calculateTotals() {
  const formData = new FormData(elements.form);
  const chargeableWeight = Number(formData.get('chargeable_weight') || 0);
  const sellingRate = Number(formData.get('selling_rate') || 0);
  const interlineRate = Number(formData.get('interline_rate') || 0);
  const secondLegRateCost = Number(formData.get('second_leg_rate_cost') || 0);
  const totalRevenue = chargeableWeight * sellingRate;
  const totalCost = interlineRate + secondLegRateCost;
  elements.totalRevenue.textContent = formatCurrency(totalRevenue);
  elements.totalCost.textContent = formatCurrency(totalCost);
  return { totalRevenue, totalCost };
}

function formPayload() {
  const formData = new FormData(elements.form);
  const { totalRevenue, totalCost } = calculateTotals();
  return {
    airline: formData.get('airline'),
    booking_date: formData.get('booking_date'),
    status: formData.get('status'),
    mawb: formData.get('mawb'),
    agent_name: formData.get('agent_name'),
    gate: formData.get('gate'),
    dest: formData.get('dest'),
    chargeable_weight: Number(formData.get('chargeable_weight') || 0),
    selling_rate: Number(formData.get('selling_rate') || 0),
    interline_rate: Number(formData.get('interline_rate') || 0),
    second_leg_rate_cost: Number(formData.get('second_leg_rate_cost') || 0),
    total_revenue: totalRevenue,
    total_cost: totalCost,
    leg1_routing: formData.get('leg1_routing'),
    leg1_flight_number: formData.get('leg1_flight_number'),
    leg1_etd: formData.get('leg1_etd') || null,
    leg2_routing: formData.get('leg2_routing'),
    leg2_flight_number: formData.get('leg2_flight_number'),
    leg2_etd: formData.get('leg2_etd') || null,
    leg3_routing: formData.get('leg3_routing'),
    leg3_flight_number: formData.get('leg3_flight_number'),
    leg3_etd: formData.get('leg3_etd') || null,
    last_leg_routing: formData.get('last_leg_routing'),
    last_leg_flight_number: formData.get('last_leg_flight_number'),
    last_leg_etd: formData.get('last_leg_etd') || null,
  };
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!state.supabase) {
    showMessage('Supabase belum dikonfigurasi, data belum dapat disimpan.', 'error');
    return;
  }
  const payload = formPayload();
  const { data, error } = await state.supabase.from('cargo_shipments').insert(payload).select().single();
  if (error) {
    showMessage(`Gagal menyimpan booking: ${error.message}`, 'error');
    return;
  }
  state.shipments.unshift(data);
  state.agents = [...new Set([...state.agents, data.agent_name].filter(Boolean))].sort();
  renderAgentSuggestions();
  closeModal();
  showMessage(`Booking ${data.mawb} berhasil dibuat.`);
  render();
}

function openModal() {
  elements.form.reset();
  elements.form.elements.booking_date.valueAsDate = new Date();
  calculateTotals();
  renderLeg2Options();
  elements.modal.classList.remove('hidden');
  elements.modal.classList.add('flex');
}

function closeModal() {
  elements.modal.classList.add('hidden');
  elements.modal.classList.remove('flex');
}

function bindEvents() {
  elements.tabs.forEach((tab) => tab.addEventListener('click', () => {
    state.currentView = tab.dataset.view;
    render();
  }));
  elements.search.addEventListener('input', (event) => {
    state.search = event.target.value;
    render();
  });
  elements.refresh.addEventListener('click', loadShipments);
  elements.openModal.addEventListener('click', openModal);
  elements.closeModal.addEventListener('click', closeModal);
  elements.cancelBooking.addEventListener('click', closeModal);
  elements.leg1Routing.addEventListener('change', renderLeg2Options);
  elements.form.addEventListener('input', (event) => {
    if (event.target.classList.contains('calc-field')) calculateTotals();
  });
  elements.form.addEventListener('submit', handleSubmit);
  elements.table.addEventListener('change', (event) => {
    if (event.target.classList.contains('status-select')) updateStatus(event.target.dataset.id, event.target.value);
  });
  elements.modal.addEventListener('click', (event) => {
    if (event.target === elements.modal) closeModal();
  });
}

async function start() {
  bindEvents();
  state.supabase = initSupabase();
  await loadReferenceData();
  await loadShipments();
}

start();
