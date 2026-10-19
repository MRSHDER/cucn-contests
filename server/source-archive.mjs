export function withSourceArchive(state) {
  state.sourceVersions ??= [];
  state.sourceDiffs ??= [];
  state.reviewQueue ??= [];
  return state;
}

function textDifference(before, after) {
  let prefixLength = 0;
  while (prefixLength < before.length && prefixLength < after.length && before[prefixLength] === after[prefixLength]) prefixLength++;
  let suffixLength = 0;
  while (suffixLength < before.length - prefixLength && suffixLength < after.length - prefixLength && before[before.length - suffixLength - 1] === after[after.length - suffixLength - 1]) suffixLength++;
  return {
    prefixLength,
    removed: before.slice(prefixLength, before.length - suffixLength),
    added: after.slice(prefixLength, after.length - suffixLength),
  };
}

export function archiveScan(state, source, result, now) {
  if (typeof result.text !== 'string') return;
  const previous = state.sourceVersions.find(version => version.url === result.url && version.hash === source.hash);
  let version = state.sourceVersions.find(item => item.url === result.url && item.hash === result.hash);
  if (!version) {
    version = {url: result.url, resolvedUrl: result.resolvedUrl || result.url, hash: result.hash, text: result.text, fetchedAt: result.fetchedAt || now};
    state.sourceVersions.push(version);
  }
  if (previous && previous.hash !== version.hash) {
    state.sourceDiffs.push({url: result.url, beforeHash: previous.hash, afterHash: version.hash, fetchedAt: result.fetchedAt || now, ...textDifference(previous.text, version.text)});
  }
  for (const item of state.reviewQueue) {
    if (item.url === result.url && item.contentHash !== result.hash && item.status === 'pending') item.status = 'superseded';
  }
  let task = state.reviewQueue.find(item => item.url === result.url && item.contentHash === result.hash);
  if (!task) {
    task = {url: result.url, contentHash: result.hash, createdAt: now, reason: previous ? 'changed' : 'first', status: 'pending'};
    state.reviewQueue.push(task);
  } else if (task.status === 'superseded') {
    task.status = 'pending';
  }
  source.reviewStatus = task.status === 'verified' ? 'verified' : 'pending';
  if (task.status === 'verified') {
    source.reviewedHash = task.contentHash;
    source.lastReviewedAt = task.reviewedAt;
    source.reviewNote = task.quote;
  }
}

export function validateContentEvidence(state, evidence) {
  const versions = (state.sourceVersions || []).filter(version => version.url === evidence.url);
  if (!versions.length) {
    if (evidence.contentHash) throw Error('正文版本不存在，请重新抓取');
    return null;
  }
  const source = state.sourceChecks.find(item => item.url === evidence.url);
  const version = versions.find(item => item.hash === evidence.contentHash);
  if (!version || source?.hash !== version.hash) throw Error('正文版本冲突：已变化或缺失，请重新读取并核验');
  if (!version.text.includes(evidence.quote.trim())) throw Error('核验证据不在存档原文中');
  return version;
}

export function completeSourceReview(state, review, now) {
  const version = validateContentEvidence(state, review);
  const source = state.sourceChecks.find(item => item.url === review.url);
  if (!source) return;
  if (!version) throw Error('缺少存档正文版本，请先重新抓取');
  const task = state.reviewQueue.find(item => item.url === review.url && item.contentHash === version.hash);
  if (!task) throw Error('正文版本缺少待核验任务');
  task.status = 'verified';
  task.reviewedAt = now;
  task.checkedAt = review.checkedAt;
  task.quote = review.quote;
  source.lastReviewedAt = now;
  source.reviewNote = review.quote;
  source.reviewedHash = version.hash;
  source.reviewStatus = 'verified';
  if (source.status !== 'failed') source.status = 'ok';
}
