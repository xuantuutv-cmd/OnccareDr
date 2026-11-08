// Execute production modal, autosync and transaction functions; no network writes.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const section = (a, b) => html.slice(html.indexOf(a), html.indexOf(b, html.indexOf(a)));
let remote, writes = 0, refreshes = 0, closed = 0;
const messages = [], alerts = [], elements = {};
const element = id => elements[id] ||= { value: '', checked: false, disabled: false,
    classList: { contains: () => false } };
const context = { window: {}, db: {}, doc: () => ({}),
    document: { getElementById: element }, cachedPatientsList: [], currentUser: null,
    chemoProtocolsData: { AC: { name: 'AC' } }, serverTimestamp: () => 'server-time',
    alert: text => alerts.push(text), console,
    runTransaction: async (_, action) => action({
        get: async () => ({ exists: () => true, data: () => structuredClone(remote) }),
        update: (_, payload) => { writes++; remote = { ...remote, ...structuredClone(payload) }; }
    }) };
vm.createContext(context);
for (const [a,b] of [
    ['window.getCalendarDayDiff =', '/**\n         * Xử lý kết thúc theo dõi'],
    ['window.cleanPayload =', 'window.resolveCycleMeasurements ='],
    ['const PATIENT_ARRAY_FIELDS =', 'function getCurrentEditorName()'],
    ['window.normalizeProtocolHistory =', "document.addEventListener('DOMContentLoaded'"],
    ['window.autoSyncChangesToDatabase =', '// ============================================================'],
    ['window.saveCycleFromModal =', '// Đóng modal khi click vào backdrop']
]) vm.runInContext(section(a,b), context);
const w = context.window;
Object.assign(w, { canUseOncoCare: true, getSystemDateVN: () => '2026-11-08',
    resolveCycleMeasurements: () => ({}), calculateBSAandDoses() {},
    calculatePostponeScheduleDate: () => '', getCurrentEditorName: () => 'Doctor',
    getActiveTreatmentDelayFromCycles: () => null, renderTempCyclesList() {},
    showToast: text => messages.push(text), closeEditCycleModal: () => { closed++; },
    renderStatsFollowUpList() {}, viewPatientDetail: async () => { refreshes++; } });
const a = { date: '2026-10-01', cycleNum: 1, protocolUsed: 'AC', note: 'first' };
const b = { ...a, note: 'second' };
function prepare(cycles, index = 0) {
    remote = { cycles: structuredClone(cycles), markers: [{ value: 1 }] };
    context.cachedPatientsList = [{ ...structuredClone(remote), id: 'p' }];
    w.capturePatientArrayBaseline(context.cachedPatientsList[0]);
    w.tempCurrentCycles = w.normalizeProtocolHistory(structuredClone(cycles));
    w.tempCurrentMarkers = structuredClone(remote.markers);
    w.tempHistoryLogs = [];
    w.currentViewingPatient = { id: 'p' };
    w._editingCycleModalIdx = index;
    for (const [id, value] of Object.entries({ editDocId: 'p', ecm_protocolSelect: 'AC',
        ecm_protocolDisplay: 'AC', ecm_date: cycles[index].date, ecm_cycleNum: '1',
        ecm_note: 'edited', ecm_drugNames: '', ecm_doseInput: '', ecm_postponeReason: '' })) element(id).value = value;
    writes = refreshes = closed = 0; messages.length = alerts.length = 0;
}
(async () => {
    // Same day/number/week, no IDs: edit each record without changing its neighbor.
    for (const index of [0, 1]) {
        prepare([a,b], index);
        await w.saveCycleFromModal();
        assert.equal(remote.cycles[index].note, 'edited');
        assert.equal(remote.cycles[1-index].note, [a,b][1-index].note);
        assert.equal(writes, 1); assert.equal(closed, 1); assert.equal(refreshes, 1);
    }
    // Key fields may change without leaving the original record behind.
    prepare([a,b], 1); element('ecm_date').value = '2026-10-02';
    await w.saveCycleFromModal();
    assert.equal(remote.cycles.length, 2); assert.equal(remote.cycles[1].date, '2026-10-02');
    // Concurrent edits/deletion reject stale edits, preserve DB and keep modal open.
    for (const change of [() => { remote.cycles[0].note = 'server'; }, () => { remote.cycles = []; }]) {
        prepare([a]); change(); const before = JSON.stringify(remote);
        w.tempHistoryLogs = [{ id: 'unsaved' }]; w.hasPendingPatientChanges = true;
        await w.saveCycleFromModal();
        assert.equal(JSON.stringify(remote), before); assert.equal(writes, 0);
        assert.equal(closed, 0); assert.equal(refreshes, 1);
        assert.equal(w.tempHistoryLogs.length, 1); assert.equal(w.hasPendingPatientChanges, true);
        assert.equal(w._editingCycleModalIdx, -1);
        assert.ok(alerts.some(text => text.includes('xung đột')));
        assert.ok(!messages.some(text => /thành công|Đã đồng bộ hóa/.test(text)));
        assert.equal(JSON.stringify(w.tempCurrentCycles), JSON.stringify(remote.cycles));
    }
    // Unrelated concurrent additions survive targeted edit; Firestore key order is irrelevant.
    prepare([a]); remote.cycles[0] = Object.fromEntries(Object.entries(a).reverse());
    remote.cycles.push({ ...a, cycleNum: 2, note: 'concurrent addition' });
    await w.saveCycleFromModal();
    assert.equal(remote.cycles.length, 2); assert.equal(remote.cycles[1].note, 'concurrent addition');
    // Existing IDs and weeks distinguish merge keys, including legacy exact duplicates.
    for (const cycles of [[a,b], [{...a, week:'Tuần 1'}, {...a, week:'Tuần 2'}], [{...a,id:'a'}, {...a,id:'b'}]]) {
        const local = structuredClone(cycles); local[1].note = 'new';
        const result = w.mergePatientArrayChanges('cycles', cycles, cycles, local);
        assert.equal(result.conflicts.length, 0); assert.equal(result.values[0].note, cycles[0].note);
        assert.equal(result.values[1].note, 'new');
    }
    // Permission/no-document skips and network failures never produce modal success.
    prepare([a]); w.canUseOncoCare = false; await w.saveCycleFromModal();
    assert.equal(writes, 0); assert.equal(closed, 0); w.canUseOncoCare = true;
    prepare([a]); element('editDocId').value = ''; await w.saveCycleFromModal();
    assert.equal(writes, 0); assert.equal(closed, 0);
    prepare([a]); context.runTransaction = async () => { throw new Error('offline'); };
    const originalError = console.error; console.error = () => {};
    try { await w.saveCycleFromModal(); } finally { console.error = originalError; }
    assert.equal(closed, 0); assert.equal(w.tempCurrentCycles[0].note, a.note);
    assert.equal(element('ecm_saveBtn').disabled, false);
    console.log('PASS: modal edit; exact duplicates; IDs/weeks; key changes; conflicts/deletion; concurrent add; map order; panel refresh; skipped writes; network rollback.');
})().catch(error => { console.error(error); process.exitCode = 1; });
