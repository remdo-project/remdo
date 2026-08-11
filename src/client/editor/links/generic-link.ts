import type { LinkMatcher } from '@lexical/link';
import LinkifyIt from 'linkify-it';
import tlds from 'tlds';

export const WEB_LINK_ATTRIBUTES = {
  rel: 'noopener noreferrer',
  target: '_blank',
} as const;

export interface GenericDestination {
  kind: 'email' | 'web';
  url: string;
}

const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const HTML_EMAIL_LOCAL_PATTERN = /^[\w.!#$%&'*+/=?^`{|}~-]+$/;
const HOST_LABEL_PATTERN = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i;
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const HOST_WITH_PORT_PATTERN = /^[^/?#]+:\d+(?:[/?#]|$)/;
const AUTOMATIC_START_PATTERN = /[\s([{<"'“‘]/;
const AUTOMATIC_END_PATTERN = /[\s<>"“”‘’]/;
const AUTOMATIC_EMAIL_PATTERN = /[\w.!#$%&'*+/=?^`{|}~-]+@[^\s<>"“”‘’]+/gu;
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', '*', '_', '~', '"', "'", '“', '”', '‘', '’', '>']);
const CLOSER_TO_OPENER = new Map([
  [')', '('],
  [']', '['],
  ['}', '{'],
]);

// Lexical uses this expression on both sides of a match. The matcher below
// applies the narrower opening-boundary rule; this broader set also lets a link
// end before punctuation that the accepted contract excludes from its URL.
export const GENERIC_LINK_SEPARATOR = /[\s()[\]{}<>"'“”‘’.,;:!?*_~]/;

const tldSet = new Set(tlds.map((tld) => tld.toLowerCase()));
const linkify = new LinkifyIt()
  .tlds(tlds)
  .set({ fuzzyEmail: true, fuzzyIP: false, fuzzyLink: true });

interface LinkifyMatch {
  index: number;
  lastIndex: number;
  raw: string;
  schema: string;
}

function normalizeHostname(domain: string): string | null {
  if (/[\s%/:?#@\\]/.test(domain) || domain.includes('[') || domain.includes(']')) {
    return null;
  }
  try {
    const hostname = new URL(`https://${domain}`).hostname.toLowerCase();
    const labels = hostname.split('.');
    if (labels.length < 2 || labels.some((label) => !HOST_LABEL_PATTERN.test(label))) {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

function normalizeEmailAddress(input: string): string | null {
  const at = input.indexOf('@');
  if (at <= 0 || at !== input.lastIndexOf('@')) {
    return null;
  }

  const local = input.slice(0, at);
  const domain = normalizeHostname(input.slice(at + 1));
  if (!HTML_EMAIL_LOCAL_PATTERN.test(local) || !domain) {
    return null;
  }

  return `${encodeURIComponent(local)}@${domain}`;
}

function isPublicSchemeLessHostname(hostname: string): boolean {
  if (hostname.includes(':') || IPV4_PATTERN.test(hostname)) {
    return false;
  }
  const labels = hostname.toLowerCase().split('.');
  return labels.length >= 2 && tldSet.has(labels.at(-1) ?? '');
}

function normalizeWebDestination(input: string, allowSchemeLess: boolean): GenericDestination | null {
  if (input.startsWith('//')) {
    return null;
  }

  const hasScheme = SCHEME_PATTERN.test(input);
  const hasHttpScheme = /^https?:/i.test(input);
  if (hasScheme && !hasHttpScheme && !(allowSchemeLess && HOST_WITH_PORT_PATTERN.test(input))) {
    return null;
  }
  if (!hasHttpScheme && !allowSchemeLess) {
    return null;
  }

  try {
    const parsed = new URL(hasHttpScheme ? input : `https://${input}`);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return null;
    }
    if (!hasHttpScheme && !isPublicSchemeLessHostname(parsed.hostname)) {
      return null;
    }
    return { kind: 'web', url: parsed.toString() };
  } catch {
    return null;
  }
}

export function normalizeGenericDestination(input: string): GenericDestination | null {
  const value = input.trim();
  if (!value || /[\r\n]/.test(value)) {
    return null;
  }

  if (/^mailto:/i.test(value)) {
    const addressPart = value.slice(value.indexOf(':') + 1);
    if (addressPart.includes('?') || addressPart.includes('#')) {
      return null;
    }
    try {
      const address = normalizeEmailAddress(decodeURIComponent(addressPart));
      return address ? { kind: 'email', url: `mailto:${address}` } : null;
    } catch {
      return null;
    }
  }

  const email = normalizeEmailAddress(value);
  if (email) {
    return { kind: 'email', url: `mailto:${email}` };
  }

  return normalizeWebDestination(value, true);
}

function trimAutomaticCandidate(candidate: string): string {
  const trimTrailingPunctuation = (value: string) => {
    let trimmed = value;
    while (trimmed.length > 0 && TRAILING_PUNCTUATION.has(trimmed.at(-1)!)) {
      trimmed = trimmed.slice(0, -1);
    }
    return trimmed;
  };
  const trimmed = candidate;
  const balance = new Map<string, number>();
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]!;
    if ([...CLOSER_TO_OPENER.values()].includes(char)) {
      balance.set(char, (balance.get(char) ?? 0) + 1);
      continue;
    }
    const opener = CLOSER_TO_OPENER.get(char);
    if (!opener) {
      continue;
    }
    const count = balance.get(opener) ?? 0;
    if (count === 0) {
      return trimTrailingPunctuation(trimmed.slice(0, index));
    }
    balance.set(opener, count - 1);
  }
  return trimTrailingPunctuation(trimmed);
}

function hasAutomaticStartBoundary(text: string, index: number): boolean {
  return index === 0 || AUTOMATIC_START_PATTERN.test(text[index - 1] ?? '');
}

function automaticCandidateFrom(text: string, index: number): string {
  let end = index;
  while (end < text.length && !AUTOMATIC_END_PATTERN.test(text[end]!)) {
    end += 1;
  }
  return trimAutomaticCandidate(text.slice(index, end));
}

function automaticEmailMatch(text: string): ReturnType<LinkMatcher> {
  for (const match of text.matchAll(AUTOMATIC_EMAIL_PATTERN)) {
    const index = match.index;
    if (!hasAutomaticStartBoundary(text, index)) {
      continue;
    }
    const candidate = automaticCandidateFrom(text, index);
    const email = normalizeEmailAddress(candidate);
    if (email) {
      return {
        index,
        length: candidate.length,
        text: candidate,
        url: `mailto:${email}`,
      };
    }
  }
  return null;
}

function normalizeAutomaticMatch(match: LinkifyMatch, candidate: string): GenericDestination | null {
  if (match.schema === 'mailto:') {
    const email = normalizeEmailAddress(candidate);
    return email ? { kind: 'email', url: `mailto:${email}` } : null;
  }

  if (match.schema === 'http:' || match.schema === 'https:') {
    return normalizeWebDestination(candidate, false);
  }

  if (match.schema === '' && /^www\./i.test(candidate)) {
    const normalized = normalizeWebDestination(candidate, true);
    if (!normalized) {
      return null;
    }
    const labels = new URL(normalized.url).hostname.split('.');
    return labels.length >= 3 && labels[0]?.toLowerCase() === 'www' ? normalized : null;
  }

  return null;
}

export const automaticGenericLinkMatcher: LinkMatcher = (text) => {
  const email = automaticEmailMatch(text);
  if (!linkify.pretest(text)) {
    return email;
  }

  for (const match of linkify.match(text) ?? [] as LinkifyMatch[]) {
    if (!hasAutomaticStartBoundary(text, match.index)) {
      continue;
    }
    const candidate = automaticCandidateFrom(text, match.index);
    if (!candidate) {
      continue;
    }
    const destination = normalizeAutomaticMatch(match, candidate);
    if (!destination) {
      continue;
    }
    const webOrLinkifyEmail = {
      attributes: destination.kind === 'web' ? WEB_LINK_ATTRIBUTES : undefined,
      index: match.index,
      length: candidate.length,
      text: candidate,
      url: destination.url,
    };
    return !email || webOrLinkifyEmail.index < email.index ? webOrLinkifyEmail : email;
  }

  return email;
};

export function recognizeCompleteAutomaticLink(text: string): GenericDestination | null {
  const match = automaticGenericLinkMatcher(text);
  return match && match.index === 0 && match.length === text.length
    ? { kind: match.url.startsWith('mailto:') ? 'email' : 'web', url: match.url }
    : null;
}
