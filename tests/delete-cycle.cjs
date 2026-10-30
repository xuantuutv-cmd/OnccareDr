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

vm.runInContext(section('window.normalizeProtocolHistory =', "document.addEventListener('DOMContentLoaded'"), context);
vm.runInContext(section('window.getActiveTreatmentDelayFromCycles =', 'window.syncCycleMeasurements ='), context);
const target = cycle => ({ key: `cycle:${cycle.date}:${cycle.cycleNum}:false:`, value: cycle });
(async () => {
    // Reproduce the old silent retention on a concurrent edit.
    const edited = { ...newCycle, note: 'remote edit' };
    const merged = w.mergePatientArrayChanges('cycles', [oldCycle, edited], [oldCycle, newCycle], [oldCycle]);
    assert.equal(merged.values.length, 2);
    assert.equal(merged.conflicts.length, 1);
    remote = { ...ended(), cycles: [oldCycle, newCycle] };
    w.capturePatientArrayBaseline({ id: 'p', ...remote });
    let result = await w.commitPatientArraysSafely('p', { cycles: [oldCycle] }, { deleteCycle: target(newCycle) });
    assert.deepEqual(remote.cycles.map(c => c.cycleNum), [1]);
    assert.equal(remote.latestFollowUp.date, oldCycle.followUpDate);
    assert.equal(remote.endReason, 'Hoàn thành');
    assert.deepEqual(remote.markers, [{ value: 5 }]);
    // Missing baseline must not silently reinsert the explicitly deleted cycle.
    remote = { cycles: [oldCycle, newCycle] };
    w._patientArrayBaseline = { docId: null, values: {} };
    await w.commitPatientArraysSafely('p', { cycles: [oldCycle] }, { deleteCycle: target(newCycle) });
    assert.equal(remote.cycles.length, 1);
    // Concurrent append survives; derived follow-up uses the merged array.
    const third = { date: '2026-11-20', cycleNum: 3, followUpDate: '2026-12-11' };
    remote = { cycles: [oldCycle, newCycle, third] };
    w.capturePatientArrayBaseline({ id: 'p', cycles: [oldCycle, newCycle] });
    await w.commitPatientArraysSafely('p', { cycles: [oldCycle] }, { deleteCycle: target(newCycle) });
    assert.deepEqual(remote.cycles.map(c => c.cycleNum), [1, 3]);
    assert.equal(remote.latestFollowUp.date, '2026-12-11');
    remote = { cycles: [oldCycle, edited] };
    w.capturePatientArrayBaseline({ id: 'p', cycles: [oldCycle, newCycle] });
    await assert.rejects(w.commitPatientArraysSafely('p', { cycles: [oldCycle] }, { deleteCycle: target(newCycle) }), /CYCLE_DELETE_CONFLICT/);
    assert.equal(remote.cycles.length, 2);
    remote = { cycles: [oldCycle] };
    w.capturePatientArrayBaseline({ id: 'p', ...remote });
    await w.commitPatientArraysSafely('p', { cycles: [] }, { deleteCycle: target(oldCycle) });
    assert.equal(remote.cycles.length, 0);
    assert.equal(remote.latestFollowUp, null);
    // Exercise actual click-confirm, auto-sync, transaction and local/cache refresh.
    const elements = { editDocId: { value: 'p' }, btnConfirmDeleteCycle: { innerHTML: 'Xóa', disabled: false },
        delCycleBranchName: {}, delCycleDate: {}, delCycleProtocol: {}, deleteCycleConfirmModal: {} };
    const messages = [];
    let renders = 0;
    Object.assign(context, { document: { getElementById: id => elements[id] || null },
        formatDisplayDate: x => x, cachedPatientsList: [], serverTimestamp: () => 'timestamp', currentUser: null,
        console: { error() {}, warn() {} } });
    Object.assign(w, { canUseOncoCare: true, setPanelVisibility() {}, showToast: message => messages.push(message),
        renderTempCyclesList: () => renders++, renderStatsFollowUpList() {}, resolveCycleMeasurements: () => ({}),
        tempCurrentMarkers: [], tempHistoryLogs: [] });
    vm.runInContext(section('window._pendingDeleteCycleIdx = null;', 'window.handlePatientFormSubmit ='), context);
    vm.runInContext(section('window.autoSyncChangesToDatabase =', '// ============================================================'), context);
    remote = { cycles: [oldCycle, newCycle] };
    context.cachedPatientsList = [{ id: 'p', ...structuredClone(remote) }];
    w.capturePatientArrayBaseline(context.cachedPatientsList[0]);
    w.tempCurrentCycles = structuredClone(remote.cycles);
    w.deleteTempCycle(1);
    await w.executeDeleteCycle();
    assert.equal(remote.cycles.length, 1);
    assert.equal(w.tempCurrentCycles.length, 1);
    assert.equal(context.cachedPatientsList[0].cycles.length, 1);
    assert.ok(renders > 1);
    assert.ok(messages.some(m => m.includes('Đã xóa chu kỳ và lưu')));
    // A later save must not resurrect the deleted cycle from stale draft state.
    await w.autoSyncChangesToDatabase();
    assert.equal(remote.cycles.length, 1);
    assert.equal(w.tempCurrentCycles.length, 1);
    // Failed network restores UI and never announces success.
    messages.length = 0;
    w.deleteTempCycle(0);
    context.runTransaction = async () => { throw new Error('offline'); };
    await w.executeDeleteCycle();
    assert.equal(w.tempCurrentCycles.length, 1);
    assert.equal(remote.cycles.length, 1);
    assert.ok(messages.some(m => m.includes('khôi phục')));
    assert.ok(!messages.some(m => m.includes('Đã xóa chu kỳ và lưu')));
    // A new unsaved patient only changes draft state.
    elements.editDocId.value = '';
    w.deleteTempCycle(0);
    await w.executeDeleteCycle();
    assert.equal(w.tempCurrentCycles.length, 0);
    assert.equal(remote.cycles.length, 1);
    console.log('PASS: reproduce old conflict; persisted deletion; missing baseline; concurrent append/edit; last cycle; follow-up; actual UI/cache refresh; network rollback; unsaved draft.');
})().catch(error => { console.error(error); process.exitCode = 1; });
