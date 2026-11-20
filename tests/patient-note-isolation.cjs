const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const elements = {};
const element = id => elements[id] ||= { value: '' };
const pendingReads = new Map();
const messages = [];
const context = {
    window: { canUseOncoCare: true },
    document: { getElementById: element },
    db: {},
    doc: (_, collection, id) => ({ collection, id }),
    getDoc: ({ id }) => new Promise((resolve, reject) => pendingReads.set(id, { resolve, reject })),
    console: { error() {} }
};

vm.createContext(context);
vm.runInContext(section('window.resetPatientCycleDraft =', 'window.switchPatientInputTab ='), context);
vm.runInContext(section('window._patientDetailLoadSequence = 0;', 'window.viewPatientDetail ='), context);
vm.runInContext(section('window._patientFormLoadSequence = 0;', 'window.addNewCycleFromForm ='), context);

const w = context.window;
w.showToast = message => messages.push(message);
w._openEditPatientModal = async (docId, loadSequence) => {
    const patient = await w.loadPatientForEdit(docId, loadSequence);
    if (!patient) return;
    element('editDocId').value = patient.id;
    w.resetPatientCycleDraft();
};

const snapshot = (id, data = {}) => ({ exists: () => true, id, data: () => data });

(async () => {
    element('npCycleNote').value = 'ghi chú của A';
    element('npDrugNamesInput').value = 'thuốc của A';
    element('npDoseInput').value = 'liều của A';
    element('editCycleIndex').value = '3';
    w.resetPatientCycleDraft();
    assert.equal(element('npCycleNote').value, '');
    assert.equal(element('npDrugNamesInput').value, '');
    assert.equal(element('npDoseInput').value, '');
    assert.equal(element('editCycleIndex').value, '');

    const openA = w.openEditPatientModal('A');
    const openB = w.openEditPatientModal('B');
    pendingReads.get('B').resolve(snapshot('B'));
    await openB;
    assert.equal(element('editDocId').value, 'B');
    element('npCycleNote').value = 'draft của B';
    pendingReads.get('A').resolve(snapshot('A'));
    await openA;
    assert.equal(element('editDocId').value, 'B');
    assert.equal(element('npCycleNote').value, 'draft của B');

    const detailASequence = ++w._patientDetailLoadSequence;
    const detailA = w.loadPatientForDetail('detail-A', detailASequence);
    const detailBSequence = ++w._patientDetailLoadSequence;
    const detailB = w.loadPatientForDetail('detail-B', detailBSequence);
    pendingReads.get('detail-B').resolve(snapshot('detail-B', { ihc: { notes: 'ghi chú B' } }));
    assert.equal((await detailB).ihc.notes, 'ghi chú B');
    pendingReads.get('detail-A').resolve(snapshot('detail-A', { ihc: { notes: 'ghi chú A' } }));
    assert.equal(await detailA, null);

    const failed = w.openEditPatientModal('C');
    pendingReads.get('C').reject(new Error('offline'));
    await failed;
    assert.equal(element('editDocId').value, 'B');
    assert.ok(messages.some(message => message.includes('Không tải được dữ liệu hồ sơ mới nhất')));

    const missing = w.openEditPatientModal('D');
    pendingReads.get('D').resolve({ exists: () => false });
    await missing;
    assert.equal(element('editDocId').value, 'B');
    assert.ok(messages.some(message => message.includes('không còn tồn tại')));

    console.log('PASS: patient note reset; edit/detail A/B race isolation; load failure and missing-record handling.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
