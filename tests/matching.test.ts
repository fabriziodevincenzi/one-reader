import assert from 'node:assert/strict';
import test from 'node:test';
import { canReceiveLanguage, isEligibleCandidate, weightedRandomCandidate } from '../src/lib/matching.ts';

const member = (overrides: Record<string, unknown> = {}) => ({
  id: 'member-a',
  agePool: 'adult' as const,
  ageEligible: true,
  active: true,
  availableToReceive: true,
  receivedLast30Days: 0,
  blockedMemberIds: [],
  languages: [{ code: 'en', willingToRead: true }],
  ...overrides,
});

test('matches the opening language only against the recipient receiving languages', () => {
  assert.equal(canReceiveLanguage(member({ languages: [{ code: 'fr', willingToRead: true }] }), 'fr'), true);
  assert.equal(canReceiveLanguage(member({
    id: 'member-b',
    languages: [{ code: 'it', willingToRead: true }],
  }), 'fr'), false);
  assert.equal(canReceiveLanguage(member({
    id: 'member-b',
    languages: [{ code: 'fr', willingToRead: false }],
  }), 'fr'), false);
});

test('rejects self matches, blocks, unavailable members and recent pairs', () => {
  const sender = member();
  assert.equal(isEligibleCandidate(sender, sender, 'en'), false);
  assert.equal(isEligibleCandidate(sender, member({ id: 'member-b', availableToReceive: false }), 'en'), false);
  assert.equal(isEligibleCandidate(member({ blockedMemberIds: ['member-b'] }), member({ id: 'member-b' }), 'en'), false);
  assert.equal(isEligibleCandidate(sender, member({ id: 'member-b' }), 'en', ['member-b']), false);
});

test('keeps 14–17 and adult members in separate pools', () => {
  const adult = member({ id: 'adult', agePool: 'adult' });
  const minor = member({ id: 'minor', agePool: 'minor' });
  const minorPeer = member({ id: 'minor-peer', agePool: 'minor' });
  assert.equal(isEligibleCandidate(adult, minor, 'en'), false);
  assert.equal(isEligibleCandidate(minor, adult, 'en'), false);
  assert.equal(isEligibleCandidate(minor, minorPeer, 'en'), true);
  assert.equal(isEligibleCandidate(minor, member({ id: 'too-young', agePool: 'minor', ageEligible: false }), 'en'), false);
});

test('inverse-frequency selection gives a larger interval to less-used readers', () => {
  const fresh = member({ id: 'fresh', receivedLast30Days: 0 });
  const busy = member({ id: 'busy', receivedLast30Days: 3 });
  assert.equal(weightedRandomCandidate([fresh, busy], () => 0.1)?.id, 'fresh');
  assert.equal(weightedRandomCandidate([fresh, busy], () => 0.95)?.id, 'busy');
});
