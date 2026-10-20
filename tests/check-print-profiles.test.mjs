import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultCustomCheckPositions } from '../src/tbsCustomCheckLayout.js';
import {
  normalizeCustomCheckProfileLibrary, saveNamedCustomCheckProfile, selectNamedCustomCheckProfile,
  deleteNamedCustomCheckProfile, getNamedCustomCheckProfile, emptyCustomCheckSettings,
} from '../src/tbsCustomCheckProfiles.js';

const base = emptyCustomCheckSettings();
const changed = { ...base, offsetX: 0.15, offsetY: -0.10, scalePct: 105,
  positions: { ...base.positions, amount: { x: 5.85, y: 0.95 } } };

test('separate names store distinct field positions and whole-printer calibration', () => {
  const first = saveNamedCustomCheckProfile({presets:[], selectedName:''}, 'Banco Popular', changed);
  assert.equal(first.error,'');
  const second = saveNamedCustomCheckProfile(first.library, 'Cooperativa', base);
  assert.equal(second.error,'');
  assert.equal(second.library.presets.length, 2);
  assert.equal(getNamedCustomCheckProfile(second.library,'Banco Popular').offsetX, 0.15);
  assert.equal(getNamedCustomCheckProfile(second.library,'Banco Popular').scalePct, 105);
  assert.equal(getNamedCustomCheckProfile(second.library,'Banco Popular').positions.amount.x, 5.85);
  assert.equal(getNamedCustomCheckProfile(second.library,'Cooperativa').positions.amount.x, defaultCustomCheckPositions().amount.x);
  const reloaded = normalizeCustomCheckProfileLibrary(JSON.parse(JSON.stringify(second.library)));
  assert.equal(reloaded.selectedName,'Cooperativa');
  assert.equal(selectNamedCustomCheckProfile(reloaded,'Banco Popular').selectedName,'Banco Popular');
});

test('new names cannot accidentally overwrite; update selected changes only one layout', () => {
  const first = saveNamedCustomCheckProfile({presets:[], selectedName:''}, 'Bank A', base).library;
  const two = saveNamedCustomCheckProfile(first, 'Bank B', base).library;
  const duplicate = saveNamedCustomCheckProfile(two, ' bank a ', changed);
  assert.match(duplicate.error, /already saved/);
  assert.equal(duplicate.library.presets.length, 2);
  const updated = saveNamedCustomCheckProfile(two, 'bank a', changed, true);
  assert.equal(updated.error,'');
  assert.equal(updated.library.selectedName,'Bank A');
  assert.equal(updated.library.presets.length, 2);
  assert.equal(getNamedCustomCheckProfile(updated.library,'Bank A').positions.amount.x, 5.85);
  assert.equal(getNamedCustomCheckProfile(updated.library,'Bank B').positions.amount.x, base.positions.amount.x);
});

test('delete removes only requested preset; blank and missing updates rejected', () => {
  const one = saveNamedCustomCheckProfile({presets:[],selectedName:''},'Name 1',base).library;
  const two = saveNamedCustomCheckProfile(one,'Name 2',changed).library;
  const deleted = deleteNamedCustomCheckProfile(two,'Name 1');
  assert.deepEqual(deleted.presets.map(p=>p.name), ['Name 2']);
  assert.equal(deleted.selectedName, '');
  assert.match(saveNamedCustomCheckProfile(deleted,'   ',base).error, /Enter a name/);
  assert.match(saveNamedCustomCheckProfile(deleted,'Unknown',base,true).error, /Select an existing/);
});

test('legacy one-layout browser calibration is preserved and given a reusable name', () => {
  const legacy = { ...defaultCustomCheckPositions(), date: {x:5.85,y:0.35} };
  const converted = normalizeCustomCheckProfileLibrary(null,legacy);
  assert.equal(converted.presets.length,1);
  assert.equal(converted.selectedName,'Previous Custom Calibration');
  assert.deepEqual(converted.presets[0].positions.date,{x:5.85,y:0.35});
  assert.deepEqual(normalizeCustomCheckProfileLibrary({presets:[],selectedName:''}).presets,[]);
  assert.equal(normalizeCustomCheckProfileLibrary({presets:[
    {name:' One ', positions:base.positions},{name:'one', positions:changed.positions}
  ]}).presets.length,1);
});
