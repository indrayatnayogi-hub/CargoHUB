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

const FIELD_ALIASES = {
  airline: ['airline', 'Airline'],
  booking_date: ['booking_date', 'Booking Date', 'bookingDate'],
  status: ['status', 'Status'],
  mawb: ['mawb', 'MAWB'],
  agent_name: ['agent_name', 'Agent Name', 'agentName'],
  gate: ['gate', 'Gate'],
  dest: ['destination', 'Destination', 'dest', 'Dest'],
  quantity: ['quantity', 'Quantity'],
  gross_weight: ['gross_weight', 'Gross Weight', 'grossWeight'],
  cbm: ['cbm', 'CBM'],
  chargeable_weight: ['chargeable_weight', 'Chargeable Weight', 'chargeableWeight'],
  selling_rate: ['selling_rate', 'Selling Rate', 'sellingRate'],
  interline_cost: ['interline_cost', 'Interline Cost', 'interline_rate', 'Interline Rate', 'interlineRate'],
  second_leg_cost: ['second_leg_cost', 'Second Leg Cost', 'second_leg_rate_cost', 'Second Leg Rate Cost', 'secondLegRateCost'],
  total_revenue: ['total_revenue', 'Total Revenue', 'totalRevenue'],
  total_cost: ['total_cost', 'Total Cost', 'totalCost'],
  leg1_routing: ['leg1_routing', 'Leg 1 Routing', 'Routing 1', 'Routing Leg 1'],
  leg1_flight_number: ['leg1_flight_number', 'Leg 1 Flight Number', 'Flight Number 1', 'Flight Leg 1'],
  leg1_etd: ['leg1_etd', 'Leg 1 ETD', 'ETD 1', 'ETD Leg 1'],
  leg2_routing: ['leg2_routing', 'Leg 2 Routing', 'Routing 2', 'Routing Leg 2'],
  leg2_flight_number: ['leg2_flight_number', 'Leg 2 Flight Number', 'Flight Number 2', 'Flight Leg 2'],
  leg2_etd: ['leg2_etd', 'Leg 2 ETD', 'ETD 2', 'ETD Leg 2'],
  leg3_routing: ['leg3_routing', 'Leg 3 Routing', 'Routing 3', 'Routing Leg 3'],
  leg3_flight_number: ['leg3_flight_number', 'Leg 3 Flight Number', 'Flight Number 3', 'Flight Leg 3'],
  leg3_etd: ['leg3_etd', 'Leg 3 ETD', 'ETD 3', 'ETD Leg 3'],
  leg4_routing: ['leg4_routing', 'Leg 4 Routing', 'last_leg_routing', 'Last Leg Routing', 'Routing 4', 'Routing Last Leg'],
  leg4_flight_number: ['leg4_flight_number', 'Leg 4 Flight Number', 'last_leg_flight_number', 'Last Leg Flight Number', 'Flight Number 4', 'Flight Last Leg'],
  leg4_etd: ['leg4_etd', 'Leg 4 ETD', 'last_leg_etd', 'Last Leg ETD', 'ETD 4', 'ETD Last Leg'],
  remark: ['remark', 'Remark'],
};

const state = {
  currentView: 'booking',
  shipments: [],
  routings: [],
  flights: [],
  agents: [],
  supabase: null,
  search: '',
  fieldKeys: {},
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


function getField(item, field) {
  const aliases = FIELD_ALIASES[field] || [field];
  const key = aliases.find((alias) => Object.prototype.hasOwnProperty.call(item, alias));
  return key ? item[key] : '';
}

function setField(payload, field, value) {
  payload[state.fieldKeys[field] || FIELD_ALIASES[field][0]] = value;
}

function detectFieldKeys(rows) {
  rows.forEach((row) => {
    Object.entries(FIELD_ALIASES).forEach(([field, aliases]) => {
      if (state.fieldKeys[field]) return;
      const key = aliases.find((alias) => Object.prototype.hasOwnProperty.call(row, alias));
      if (key) state.fieldKeys[field] = key;
    });
  });
}

function getShipmentId(item) {
  return item.id || getField(item, 'mawb');
}

function sortShipmentsByBookingDate(shipments) {
  return [...shipments].sort((a, b) => new Date(getField(b, 'booking_date') || 0) - new Date(getField(a, 'booking_date') || 0));
}

function formatSupabaseError(error) {
  return [error.code, error.message, error.details, error.hint].filter(Boolean).join(' | ');
}

function tableErrorMessage(table, action, error) {
  const details = formatSupabaseError(error);
  const checklist = [
    `tabel ${table} ada di schema public`,
    `nama tabel persis ${table} (huruf besar/kecil berpengaruh)`,
    'schema public masuk API exposed schemas',
    'RLS policy SELECT/INSERT/UPDATE untuk role anon tidak error',
  ].join('; ');
  return `Supabase gagal ${action} ${table}: ${details}. Cek di Supabase: ${checklist}.`;
}

function logSupabaseError(table, action, error) {
  console.error(`Supabase ${action} failed for ${table}`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}

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
  elements.message.className = `mt-5 rounded-2xl whitespace-pre-wrap p-4 text-sm ${type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`;
  elements.message.textContent = text;
  elements.message.classList.remove('hidden');
  if (type !== 'error') {
    window.setTimeout(() => elements.message.classList.add('hidden'), 4000);
  }
}

async function fetchTable(table, columns = '*') {
  if (!state.supabase) return [];
  const { data, error } = await state.supabase.from(table).select(columns);
  if (error) {
    logSupabaseError(table, 'select', error);
    throw error;
  }
  return data || [];
}

async function fetchOptionalTable(table, fallback = []) {
  try {
    return await fetchTable(table);
  } catch (error) {
    console.warn(tableErrorMessage(table, 'load reference data from', error));
    return fallback;
  }
}

async function loadReferenceData() {
  const [routings, flights, agents] = await Promise.all([
    fetchOptionalTable('master_routings', FALLBACK_ROUTINGS),
    fetchOptionalTable('master_flights', FALLBACK_FLIGHTS.map((flight_number) => ({ flight_number }))),
    fetchOptionalTable('cargo_shipments', []),
  ]);
  state.routings = routings.length ? routings : FALLBACK_ROUTINGS;
  state.flights = flights.length ? flights : FALLBACK_FLIGHTS.map((flight_number) => ({ flight_number }));
  detectFieldKeys(agents);
  state.agents = [...new Set(agents.map((item) => getField(item, 'agent_name')).filter(Boolean))].sort();
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
    const { data, error } = await state.supabase.from('cargo_shipments').select('*');
    if (error) throw error;
    state.shipments = sortShipmentsByBookingDate(data || []);
    detectFieldKeys(state.shipments);
    state.agents = [...new Set(state.shipments.map((item) => getField(item, 'agent_name')).filter(Boolean))].sort();
    renderAgentSuggestions();
    render();
  } catch (error) {
    showMessage(tableErrorMessage('cargo_shipments', 'load data from', error), 'error');
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
  elements.statActive.textContent = state.shipments.filter((item) => VIEW_FILTERS.booking.includes(getField(item, 'status'))).length;
  elements.statUtilized.textContent = state.shipments.filter((item) => VIEW_FILTERS.monitoring.includes(getField(item, 'status'))).length;
  elements.statCancelled.textContent = state.shipments.filter((item) => VIEW_FILTERS.cancelled.includes(getField(item, 'status'))).length;
}

function filteredShipments() {
  const statuses = VIEW_FILTERS[state.currentView];
  const query = state.search.toLowerCase();
  return state.shipments.filter((item) => {
    const matchesView = statuses.includes(getField(item, 'status'));
    const haystack = ['airline', 'mawb', 'agent_name', 'gate', 'dest', 'leg1_routing', 'leg2_routing', 'leg3_routing', 'leg4_routing', 'remark'].map((field) => getField(item, field)).join(' ').toLowerCase();
    return matchesView && (!query || haystack.includes(query));
  });
}

function renderShipmentRow(item) {
  const id = getShipmentId(item);
  const legs = [1, 2, 3].map((leg) => formatLeg(getField(item, `leg${leg}_routing`), getField(item, `leg${leg}_flight_number`), getField(item, `leg${leg}_etd`))).filter(Boolean);
  const leg4 = formatLeg(getField(item, 'leg4_routing'), getField(item, 'leg4_flight_number'), getField(item, 'leg4_etd'));
  if (leg4) legs.push(leg4);
  return `
    <tr class="align-top transition hover:bg-slate-50">
      <td class="px-4 py-4 font-semibold text-slate-900">${escapeHtml(getField(item, 'airline'))}</td>
      <td class="px-4 py-4 whitespace-nowrap text-slate-600">${formatDate(getField(item, 'booking_date'))}</td>
      <td class="px-4 py-4">${renderStatusSelect(id, getField(item, 'status'))}</td>
      <td class="px-4 py-4 font-mono text-xs text-slate-700">${escapeHtml(getField(item, 'mawb'))}</td>
      <td class="px-4 py-4 text-slate-700">${escapeHtml(getField(item, 'agent_name'))}</td>
      <td class="px-4 py-4"><span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">${escapeHtml(getField(item, 'gate'))}</span></td>
      <td class="px-4 py-4 font-semibold text-slate-700">${escapeHtml(getField(item, 'dest'))}</td>
      <td class="px-4 py-4 text-right text-slate-700">${formatNumber(getField(item, 'quantity'))}</td>
      <td class="px-4 py-4 text-right text-slate-700">${formatNumber(getField(item, 'gross_weight'))}</td>
      <td class="px-4 py-4 text-right text-slate-700">${formatNumber(getField(item, 'cbm'))}</td>
      <td class="px-4 py-4 text-xs text-slate-600">${legs.length ? legs.join('<br>') : '-'}</td>
      <td class="px-4 py-4 text-right font-semibold text-emerald-700">${formatCurrency(getField(item, 'total_revenue'))}</td>
      <td class="px-4 py-4 text-right font-semibold text-rose-700">${formatCurrency(getField(item, 'total_cost'))}</td>
      <td class="px-4 py-4 text-xs text-slate-600">${escapeHtml(getField(item, 'remark'))}</td>
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

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

async function updateStatus(id, status) {
  const shipment = state.shipments.find((item) => String(getShipmentId(item)) === String(id));
  if (!shipment || !state.supabase) return;
  const key = shipment.id ? 'id' : (Object.prototype.hasOwnProperty.call(shipment, 'MAWB') ? 'MAWB' : 'mawb');
  const statusKey = Object.prototype.hasOwnProperty.call(shipment, 'Status') ? 'Status' : 'status';
  const { error } = await state.supabase.from('cargo_shipments').update({ [statusKey]: status }).eq(key, shipment[key]);
  if (error) {
    logSupabaseError('cargo_shipments', 'update', error);
    showMessage(tableErrorMessage('cargo_shipments', 'update status in', error), 'error');
    render();
    return;
  }
  shipment[statusKey] = status;
  showMessage(`Status MAWB ${getField(shipment, 'mawb')} diubah ke ${status}.`);
  render();
}

function calculateTotals() {
  const formData = new FormData(elements.form);
  const chargeableWeight = Number(formData.get('chargeable_weight') || 0);
  const sellingRate = Number(formData.get('selling_rate') || 0);
  const interlineCost = Number(formData.get('interline_cost') || 0);
  const secondLegCost = Number(formData.get('second_leg_cost') || 0);
  const totalRevenue = chargeableWeight * sellingRate;
  const totalCost = interlineCost + secondLegCost;
  elements.totalRevenue.textContent = formatCurrency(totalRevenue);
  elements.totalCost.textContent = formatCurrency(totalCost);
  return { totalRevenue, totalCost };
}

function formPayload() {
  const formData = new FormData(elements.form);
  const { totalRevenue, totalCost } = calculateTotals();
  const payload = {};
  setField(payload, 'airline', formData.get('airline'));
  setField(payload, 'booking_date', formData.get('booking_date'));
  setField(payload, 'status', formData.get('status'));
  setField(payload, 'mawb', formData.get('mawb'));
  setField(payload, 'agent_name', formData.get('agent_name'));
  setField(payload, 'gate', formData.get('gate'));
  setField(payload, 'dest', formData.get('dest'));
  setField(payload, 'quantity', Number(formData.get('quantity') || 0));
  setField(payload, 'gross_weight', Number(formData.get('gross_weight') || 0));
  setField(payload, 'cbm', Number(formData.get('cbm') || 0));
  setField(payload, 'chargeable_weight', Number(formData.get('chargeable_weight') || 0));
  setField(payload, 'selling_rate', Number(formData.get('selling_rate') || 0));
  setField(payload, 'interline_cost', Number(formData.get('interline_cost') || 0));
  setField(payload, 'second_leg_cost', Number(formData.get('second_leg_cost') || 0));
  setField(payload, 'total_revenue', totalRevenue);
  setField(payload, 'total_cost', totalCost);
  setField(payload, 'leg1_routing', formData.get('leg1_routing'));
  setField(payload, 'leg1_flight_number', formData.get('leg1_flight_number'));
  setField(payload, 'leg1_etd', formData.get('leg1_etd') || null);
  setField(payload, 'leg2_routing', formData.get('leg2_routing'));
  setField(payload, 'leg2_flight_number', formData.get('leg2_flight_number'));
  setField(payload, 'leg2_etd', formData.get('leg2_etd') || null);
  setField(payload, 'leg3_routing', formData.get('leg3_routing'));
  setField(payload, 'leg3_flight_number', formData.get('leg3_flight_number'));
  setField(payload, 'leg3_etd', formData.get('leg3_etd') || null);
  setField(payload, 'leg4_routing', formData.get('leg4_routing'));
  setField(payload, 'leg4_flight_number', formData.get('leg4_flight_number'));
  setField(payload, 'leg4_etd', formData.get('leg4_etd') || null);
  setField(payload, 'remark', formData.get('remark'));
  return payload;
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
    logSupabaseError('cargo_shipments', 'insert', error);
    showMessage(tableErrorMessage('cargo_shipments', 'save booking into', error), 'error');
    return;
  }
  state.shipments.unshift(data);
  state.agents = [...new Set([...state.agents, getField(data, 'agent_name')].filter(Boolean))].sort();
  renderAgentSuggestions();
  closeModal();
  showMessage(`Booking ${getField(data, 'mawb')} berhasil dibuat.`);
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
