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
(async () => {
    let result = await save(ended(), [oldCycle, newCycle]);
    assert.equal(remote.endReason, null);
    assert.equal(remote.isEndedTreatment, false);
    assert.equal(remote.endTreatmentDate, null);
    assert.deepEqual(remote.cycles, [oldCycle, newCycle]);
    assert.deepEqual(remote.historyLogs, [{ id: 'old' }]);
    assert.deepEqual(remote.markers, [{ value: 5 }]);
    assert.equal(w.getPatientLatestFollowUp(result.patient).isEndedTreatment, false);
    assert.equal(remote.latestFollowUp.date, '2026-11-20');
    await save(ended(), [{ ...oldCycle, doseInput: 'new dose', followUpDate: '2026-11-20' }]);
    assert.equal(remote.endReason, null);
    await save(ended(), [{ ...oldCycle, followUpDate: '2026-11-20' }]);
    assert.equal(remote.endReason, 'Hoàn thành');
    await save(ended(), []);
    assert.equal(remote.endReason, 'Hoàn thành');
    await save(ended(), [oldCycle, { date: '2026-10-30', cycleNum: 2, isPostponed: true }]);
    assert.equal(remote.endReason, 'Hoàn thành');
    await save(ended(), [oldCycle, { date: '2026-10-30', cycleNum: 2 }]);
    assert.equal(remote.endReason, null);
    assert.equal(remote.latestFollowUp, null);
    // Conflicting local cycle edit is rejected: ending must remain intact.
    const baseline = ended();
    remote = { ...ended(), cycles: [{ ...oldCycle, doseInput: 'remote dose' }] };
    w.capturePatientArrayBaseline({ id: 'p', ...baseline });
    result = await w.commitPatientArraysSafely('p', { cycles: [{ ...oldCycle, doseInput: 'local dose' }] });
    assert.equal(result.conflicts.length, 1);
    assert.equal(remote.endReason, 'Hoàn thành');
    const fu = w.getPatientLatestFollowUp({ cycles: [oldCycle, { date: '2026-10-30', cycleNum: 2 }], latestFollowUp: { date: '2026-09-22' }, endReason: 'old' });
    assert.equal(fu.hasNewCycle, true);
    assert.equal(fu.isEndedTreatment, false);
    assert.equal(fu.isOverdue, false);
    const stillEnded = w.getPatientLatestFollowUp(ended());
    assert.equal(stillEnded.isEndedTreatment, true);
    // Parse all inline scripts, removing imports only for this syntax check.
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
        new vm.Script(match[1].replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/g, ''));
    }
    console.log('PASS: reset on add/edit; preserve history; follow-up-only/delete/postpone do not reset; conflict protection; no-follow-up; classification; inline script syntax.');
})().catch(error => { console.error(error); process.exitCode = 1; });
