export interface LanguageAbility {
  code: string;
  willingToRead: boolean;
}

export interface MatchingMember {
  id: string;
  agePool: 'minor' | 'adult';
  ageEligible: boolean;
  active: boolean;
  availableToReceive: boolean;
  receivedLast30Days: number;
  blockedMemberIds: string[];
  languages: LanguageAbility[];
}

export function canReceiveLanguage(candidate: MatchingMember, languageCode: string) {
  return candidate.languages.some(
    (candidateLanguage) => candidateLanguage.code === languageCode && candidateLanguage.willingToRead,
  );
}

export function isEligibleCandidate(
  sender: MatchingMember,
  candidate: MatchingMember,
  languageCode: string,
  recentPairIds: string[] = [],
) {
  return (
    sender.id !== candidate.id &&
    sender.ageEligible &&
    candidate.ageEligible &&
    sender.agePool === candidate.agePool &&
    candidate.active &&
    candidate.availableToReceive &&
    !sender.blockedMemberIds.includes(candidate.id) &&
    !candidate.blockedMemberIds.includes(sender.id) &&
    !recentPairIds.includes(candidate.id) &&
    canReceiveLanguage(candidate, languageCode)
  );
}

export function weightedRandomCandidate<T extends MatchingMember>(candidates: T[], random = Math.random) {
  if (candidates.length === 0) return undefined;

  const weights = candidates.map((candidate) => 1 / (1 + Math.max(0, candidate.receivedLast30Days)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = random() * totalWeight;

  for (let index = 0; index < candidates.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return candidates[index];
  }

  return candidates.at(-1);
}
