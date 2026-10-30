// Runs the actual inline functions with an in-memory Firestore transaction.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
let remote;
const context = { window: {}, db: {}, doc: () => ({}),
    runTransaction: async (_, callback) => callback({
        get: async () => ({ exists: () => true, data: () => structuredClone(remote) }),
        update: (_, payload) => { remote = { ...remote, ...structuredClone(payload) }; }
    }) };
vm.createContext(context);
vm.runInContext(section('window.getCalendarDayDiff =', '/**\n         * Xử lý kết thúc theo dõi'), context);
vm.runInContext(section('window.cleanPayload =', 'window.resolveCycleMeasurements ='), context);
vm.runInContext(section('const PATIENT_ARRAY_FIELDS =', 'function getCurrentEditorName()'), context);
const w = context.window;
w.getSystemDateVN = () => '2026-10-30';
const oldCycle = { date: '2026-09-01', cycleNum: 1, protocolUsed: 'AC', followUpDate: '2026-09-22' };
const newCycle = { date: '2026-10-30', cycleNum: 2, protocolUsed: 'AC', followUpDate: '2026-11-20', followUpDays: 21 };
const ended = () => ({ cycles: [structuredClone(oldCycle)], endReason: 'Hoàn thành', isEndedTreatment: true, endTreatmentDate: '2026-09-25', markers: [{ value: 5 }], historyLogs: [{ id: 'old' }] });
async function save(patient, cycles) {
    remote = structuredClone(patient);
    w.capturePatientArrayBaseline({ id: 'p', ...patient });
    return w.commitPatientArraysSafely('p', { cycles });
}

context.serverTimestamp = () => 'server-time';
w.canUseOncoCare = true;
vm.runInContext(section('window.normalizeProtocolHistory =', "document.addEventListener('DOMContentLoaded'"), context);
vm.runInContext(section('window.getActiveTreatmentDelayFromCycles =', 'window.syncCycleMeasurements ='), context);
const target = (cycle, occurrence = 0) => {
    context.selectedCycle = cycle;
    return { docId: 'p', identity: vm.runInContext('cycleDeleteIdentity(selectedCycle)', context),
        fingerprint: vm.runInContext('cycleDeleteFingerprint(selectedCycle)', context), occurrence };
};
const deleteCycle = (cycle, occurrence) => w.deletePatientCycleSafely('p', target(cycle, occurrence));
const originalTransaction = context.runTransaction;
(async () => {
    // The old JSON comparison falsely reports conflict when Firestore returns a map
    // with different property insertion order. Normalization also adds a derived flag.
    const shuffled = Object.fromEntries(Object.entries(newCycle).reverse());
    assert.notEqual(JSON.stringify(newCycle), JSON.stringify(shuffled));
    assert.equal(target(newCycle).fingerprint, target({ ...shuffled, isChangedProtocol: true }).fingerprint);
    remote = { ...ended(), cycles: [oldCycle, shuffled], responseAssessments: [{ date: 'old' }] };
    const unrelated = JSON.stringify({ markers: remote.markers, historyLogs: remote.historyLogs, responseAssessments: remote.responseAssessments });
    w.capturePatientArrayBaseline({ id: 'p', ...remote });
    const result = await deleteCycle({ ...newCycle, isChangedProtocol: false });
    assert.deepEqual(remote.cycles.map(c => c.cycleNum), [1]);
    assert.equal(remote.latestFollowUp.date, oldCycle.followUpDate);
    assert.equal(remote.endReason, 'Hoàn thành');
    assert.equal(JSON.stringify({ markers: remote.markers, historyLogs: remote.historyLogs, responseAssessments: remote.responseAssessments }), unrelated);
    // Legacy duplicate composite keys must remove exactly the selected record.
    const duplicate = { ...newCycle, note: 'second entry' };
    remote = { cycles: [oldCycle, newCycle, duplicate] };
    await deleteCycle(duplicate);
    assert.equal(remote.cycles.length, 2);
    assert.ok(remote.cycles.some(c => c.cycleNum === 2 && !c.note));
    remote = { cycles: [oldCycle, newCycle, newCycle] };
    await deleteCycle(newCycle, 1);
    assert.equal(remote.cycles.length, 2);
    // Stable IDs distinguish otherwise identical records.
    remote = { cycles: [{ ...newCycle, id: 'a' }, { ...newCycle, id: 'b' }] };
    await deleteCycle({ ...newCycle, id: 'b' });
    assert.deepEqual(remote.cycles.map(c => c.id), ['a']);
    // Read fresh remote cycles, preserve concurrent additions, refresh follow-up.
    const third = { date: '2026-11-20', cycleNum: 3, followUpDate: '2026-12-11' };
    remote = { cycles: [oldCycle, newCycle, third] };
    w._patientArrayBaseline = { docId: null, values: {} };
    await deleteCycle(newCycle);
    assert.deepEqual(remote.cycles.map(c => c.cycleNum), [1, 3]);
    assert.equal(remote.latestFollowUp.date, '2026-12-11');
    remote = { cycles: [oldCycle, { ...newCycle, note: 'concurrent edit' }] };
    await assert.rejects(deleteCycle(newCycle), /CYCLE_DELETE_CONFLICT/);
    assert.equal(remote.cycles.length, 2);
    remote = { cycles: [oldCycle] };
    await deleteCycle(oldCycle);
    assert.equal(remote.cycles.length, 0);
    assert.equal(remote.latestFollowUp, null);
    await deleteCycle(oldCycle); // Already deleted: idempotent, no other data removed.
    assert.equal(remote.cycles.length, 0);
    // Real event handlers + confirmation + transaction; no general autosync dependencies.
    const elements = { editDocId: { value: 'p' }, editCycleIndex: { value: '1' }, btnConfirmDeleteCycle: { innerHTML: 'Xóa', disabled: false },
        delCycleBranchName: {}, delCycleDate: {}, delCycleProtocol: {}, deleteCycleConfirmModal: {},
        existingCyclesList: { innerHTML: '', children: [], appendChild(child) { this.children.push(child); } }, existingCyclesCount: {} };
    const messages = [];
    let renders = 0;
    Object.assign(context, { document: { getElementById: id => elements[id] || null,
        createElement: () => ({ innerHTML: '', buttons: {}, querySelector(selector) {
            const action = selector.includes('delete') ? 'delete' : 'edit';
            const index = Number(this.innerHTML.match(/data-cycle-index="(\d+)"/)[1]);
            return this.buttons[action] = { dataset: { cycleIndex: String(index) }, addEventListener: (_, callback) => { this.buttons[action].click = callback; } };
        } }) }, formatDisplayDate: x => x, escapeHtml: x => String(x), cachedPatientsList: [],
        currentUser: null, console: { error() {}, warn() {} } });
    Object.assign(w, { setPanelVisibility() {}, showToast: message => messages.push(message),
        renderStatsFollowUpList() {}, resolveCycleMeasurements: () => { throw new Error('unrelated measurement error'); },
        tempCurrentMarkers: [{ value: 'unsaved marker' }], tempHistoryLogs: [{ id: 'unsaved log' }],
        autoSyncChangesToDatabase: () => { throw new Error('delete must not call general autosync'); } });
    vm.runInContext(section('window._pendingDeleteCycleIdx = null;', 'window.handlePatientFormSubmit ='), context);
    vm.runInContext(section('window.renderTempCyclesList =', '// Index marker đang chỉnh sửa'), context);
    remote = { cycles: [oldCycle, newCycle], markers: [{ value: 'saved marker' }] };
    context.cachedPatientsList = [{ id: 'p', ...structuredClone(remote) }];
    w.capturePatientArrayBaseline(context.cachedPatientsList[0]);
    w.tempCurrentCycles = structuredClone(remote.cycles);
    w.renderTempCyclesList();
    const rows = elements.existingCyclesList.children.filter(child => child.buttons.delete);
    const deleteButton = rows[1].buttons.delete;
    deleteButton.click({ stopPropagation() {}, currentTarget: deleteButton });
    assert.equal(w._pendingDeleteCycleIdx, 1);
    await w.executeDeleteCycle();
    assert.equal(remote.cycles.length, 1);
    assert.equal(w.tempCurrentCycles.length, 1);
    assert.equal(context.cachedPatientsList[0].cycles.length, 1);
    assert.equal(elements.editCycleIndex.value, '');
    assert.deepEqual(remote.markers, [{ value: 'saved marker' }]);
    assert.deepEqual(w.tempCurrentMarkers, [{ value: 'unsaved marker' }]);
    assert.equal(w.tempHistoryLogs.length, 1);
    assert.ok(messages.some(m => m.includes('Đã xóa chu kỳ và lưu')));
    // A later general save/reopen must keep the deletion, using the advanced cycles baseline.
    w.resolveCycleMeasurements = () => ({});
    vm.runInContext(section('window.autoSyncChangesToDatabase =', '// ============================================================'), context);
    await w.autoSyncChangesToDatabase();
    assert.equal(remote.cycles.length, 1);
    assert.equal(w.tempCurrentCycles.length, 1);
    assert.equal(context.cachedPatientsList[0].cycles.length, 1);
    // Permission failure is visible, rolls back, and does not write.
    messages.length = 0;
    w.deleteTempCycle(0);
    w.canUseOncoCare = false;
    await w.executeDeleteCycle();
    w.canUseOncoCare = true;
    assert.equal(w.tempCurrentCycles.length, 1);
    assert.equal(remote.cycles.length, 1);
    assert.ok(!messages.some(m => m.includes('Đã xóa chu kỳ và lưu')));
    // Network failure restores the displayed draft, not another patient/session.
    messages.length = 0;
    w.deleteTempCycle(0);
    context.runTransaction = async () => { throw new Error('offline'); };
    await w.executeDeleteCycle();
    assert.equal(w.tempCurrentCycles.length, 1);
    assert.equal(remote.cycles.length, 1);
    assert.ok(messages.some(m => m.includes('khôi phục')));
    assert.ok(!messages.some(m => m.includes('Đã xóa chu kỳ và lưu')));
    // Context changed between opening confirmation and confirm.
    context.runTransaction = originalTransaction;
    w.deleteTempCycle(0);
    elements.editDocId.value = 'other';
    await w.executeDeleteCycle();
    assert.equal(remote.cycles.length, 1);
    assert.equal(w.tempCurrentCycles.length, 1);
    // A new unsaved patient changes draft only.
    elements.editDocId.value = '';
    w.deleteTempCycle(0);
    await w.executeDeleteCycle();
    assert.equal(w.tempCurrentCycles.length, 0);
    assert.equal(remote.cycles.length, 1);
    // Prevent double-confirm while commit is pending; don't overwrite another open draft.
    elements.editDocId.value = 'p';
    w.tempCurrentCycles = [structuredClone(oldCycle)];
    w.deleteTempCycle(0);
    let release;
    let calls = 0;
    context.runTransaction = async (...args) => { calls++; await new Promise(resolve => { release = resolve; }); return originalTransaction(...args); };
    const pending = w.executeDeleteCycle();
    await w.executeDeleteCycle();
    assert.equal(calls, 1);
    elements.editDocId.value = 'other';
    const otherDraft = [{ date: 'other', cycleNum: 99 }];
    w.tempCurrentCycles = otherDraft;
    release();
    await pending;
    assert.equal(remote.cycles.length, 0);
    assert.equal(w.tempCurrentCycles, otherDraft);
    console.log('PASS: canonical comparison; derived flags; duplicate keys; exact IDs; concurrent add/edit; last cycle; idempotence; real delete event; isolated fields; rollback; changed patient; draft; double-confirm; session isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
