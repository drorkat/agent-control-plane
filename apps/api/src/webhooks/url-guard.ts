import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF protection for outbound webhook URLs.
 *
 * Outbound webhooks let an operator point the server at an arbitrary URL, which
 * is a classic Server-Side Request Forgery vector: a malicious (or mistaken) URL
 * could target the loopback interface, a private network, or a cloud metadata
 * endpoint (169.254.169.254) and exfiltrate credentials or reach internal
 * services. These helpers reject any URL whose host is — or resolves to — such an
 * address.
 *
 * The check is applied twice: once when a webhook is created ({@link
 * assertSafeWebhookUrl}) and again at delivery time ({@link isBlockedHost},
 * reused by the dispatcher), because DNS can change between the two — a name that
 * looked public at creation can later be pointed at an internal address (DNS
 * rebinding), so re-resolving right before the request is what actually defends
 * the fetch.
 */

/**
 * IPv4 ranges that must never be reached by an outbound webhook. Each is a
 * private, reserved, loopback, link-local, or CGNAT block (plus the IETF
 * protocol-assignment and TEST-NET documentation ranges); 169.254.0.0/16 also
 * covers the cloud metadata address 169.254.169.254.
 */
const BLOCKED_IPV4_CIDRS: ReadonlyArray<{ cidr: string; reason: string }> = [
  { cidr: '0.0.0.0/8', reason: '"this"/unspecified network (0.0.0.0/8)' },
  { cidr: '10.0.0.0/8', reason: 'private network (10.0.0.0/8)' },
  { cidr: '100.64.0.0/10', reason: 'carrier-grade NAT range (100.64.0.0/10)' },
  { cidr: '127.0.0.0/8', reason: 'loopback address (127.0.0.0/8)' },
  {
    cidr: '169.254.0.0/16',
    reason: 'link-local/cloud-metadata address (169.254.0.0/16)',
  },
  { cidr: '172.16.0.0/12', reason: 'private network (172.16.0.0/12)' },
  {
    cidr: '192.0.0.0/24',
    reason: 'IETF protocol-assignment range (192.0.0.0/24)',
  },
  {
    cidr: '192.0.2.0/24',
    reason: 'documentation (TEST-NET-1) range (192.0.2.0/24)',
  },
  { cidr: '192.168.0.0/16', reason: 'private network (192.168.0.0/16)' },
];

/**
 * Validate a webhook URL before it is stored, throwing BadRequestException (→ 400)
 * when it is unsafe so nothing is written for a bad URL.
 *
 * Only http(s) URLs are ever accepted. The private-address checks can be disabled
 * with WEBHOOK_ALLOW_PRIVATE=1 for local development (so a developer can point a
 * webhook at localhost); the http(s) requirement still applies even then.
 */
export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Only http(s) URLs are allowed');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('Only http(s) URLs are allowed');
  }

  // Escape hatch: skip the private-address checks entirely in local development.
  // (The http(s) requirement above is enforced regardless.)
  if (process.env.WEBHOOK_ALLOW_PRIVATE === '1') {
    return;
  }

  const reason = await isBlockedHost(parsed.hostname);
  if (reason) {
    throw new BadRequestException(reason);
  }
}

/**
 * Classify a URL host as safe (returns null) or blocked (returns a short reason,
 * suitable for a delivery error). The dispatcher reuses this to re-check the
 * target immediately before it fetches.
 *
 * This function does NOT consult WEBHOOK_ALLOW_PRIVATE — the escape hatch is
 * applied by callers, so this always reports the true classification.
 */
export async function isBlockedHost(hostname: string): Promise<string | null> {
  // URL.hostname wraps IPv6 literals in brackets (e.g. "[::1]"); strip them so
  // net.isIP and the classifiers below see the bare address.
  const host = stripBrackets(hostname).toLowerCase();

  // "localhost" (and any *.localhost) always refers to the loopback interface,
  // so block it by name outright rather than trusting a DNS answer.
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return 'Host "localhost" is not allowed';
  }

  // A literal IP is classified directly — no DNS lookup needed or wanted.
  if (isIP(host) !== 0) {
    return classifyIp(host);
  }

  // Otherwise resolve the name and block if ANY resolved address is internal.
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    // A name we cannot resolve is treated as unsafe rather than being fetched.
    return 'Could not resolve host';
  }
  for (const { address } of addresses) {
    const reason = classifyIp(address);
    if (reason) {
      return reason;
    }
  }
  return null;
}

/** Classify a single IP literal (IPv4 or IPv6); null when it is safe. */
function classifyIp(ip: string): string | null {
  const family = isIP(ip);
  if (family === 4) {
    return classifyIpv4(ip);
  }
  if (family === 6) {
    return classifyIpv6(ip);
  }
  return null;
}

/** Reason string when an IPv4 address falls in a blocked range, else null. */
function classifyIpv4(ip: string): string | null {
  for (const { cidr, reason } of BLOCKED_IPV4_CIDRS) {
    if (ipv4InRange(ip, cidr)) {
      return `Host resolves to a blocked ${reason}`;
    }
  }
  return null;
}

/** Reason string when an IPv6 address is blocked, else null. */
function classifyIpv6(ip: string): string | null {
  const bytes = ipv6ToBytes(ip);
  if (!bytes) {
    // Unparseable despite isIP saying IPv6 — fail closed.
    return 'Host resolves to an unparseable IPv6 address';
  }

  // IPv4-mapped (::ffff:a.b.c.d): first 10 bytes zero, then 0xff 0xff, then the
  // embedded IPv4 — classify that IPv4 so a mapped internal address is caught.
  const isV4Mapped =
    bytes.slice(0, 10).every((b) => b === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff;
  if (isV4Mapped) {
    const embedded = `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
    return classifyIpv4(embedded);
  }

  if (bytes.every((b) => b === 0)) {
    return 'Host resolves to the unspecified IPv6 address (::)';
  }

  const isLoopback =
    bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1;
  if (isLoopback) {
    return 'Host resolves to the IPv6 loopback address (::1)';
  }

  // fc00::/7 — unique local addresses (top 7 bits are 1111110).
  if ((bytes[0] & 0xfe) === 0xfc) {
    return 'Host resolves to a unique local IPv6 address (fc00::/7)';
  }

  // fe80::/10 — link-local (top 10 bits are 1111111010).
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) {
    return 'Host resolves to a link-local IPv6 address (fe80::/10)';
  }

  return null;
}

/** Strip a single pair of surrounding brackets from an IPv6 literal host. */
function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']')
    ? host.slice(1, -1)
    : host;
}

/** Convert a dotted-quad IPv4 string to an unsigned 32-bit integer. */
function ipv4ToInt(ip: string): number {
  const [a, b, c, d] = ip.split('.').map((part) => Number(part));
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

/** True when an IPv4 address lies within `cidr` (e.g. "10.0.0.0/8"). */
function ipv4InRange(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  // A /0 has an all-zero mask (shifting a 32-bit value by 32 is undefined in JS).
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((ipv4ToInt(ip) & mask) >>> 0) === ((ipv4ToInt(range) & mask) >>> 0);
}

/**
 * Expand an IPv6 literal (already validated by net.isIP) into its 16 bytes,
 * handling "::" compression and a trailing embedded IPv4 group. Returns null if
 * it cannot be parsed.
 */
function ipv6ToBytes(ip: string): number[] | null {
  // Drop any zone id (e.g. "fe80::1%eth0"); not expected from a URL host.
  const zone = ip.indexOf('%');
  const addr = zone === -1 ? ip : ip.slice(0, zone);

  const halves = addr.split('::');
  if (halves.length > 2) {
    return null;
  }

  // Expand one side of the address into 16-bit groups; a dotted-quad may appear
  // only as the final group and contributes two groups.
  const expand = (side: string): number[] | null => {
    if (side === '') {
      return [];
    }
    const parts = side.split(':');
    const groups: number[] = [];
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (part.includes('.')) {
        if (i !== parts.length - 1 || isIP(part) !== 4) {
          return null;
        }
        const v = ipv4ToInt(part);
        groups.push((v >>> 16) & 0xffff, v & 0xffff);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(part)) {
          return null;
        }
        groups.push(parseInt(part, 16));
      }
    }
    return groups;
  };

  const head = expand(halves[0]);
  const tail = halves.length === 2 ? expand(halves[1]) : [];
  if (head === null || tail === null) {
    return null;
  }

  let groups: number[];
  if (halves.length === 2) {
    // "::" fills the gap with as many zero groups as are missing.
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) {
      return null;
    }
    groups = [...head, ...new Array<number>(missing).fill(0), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) {
    return null;
  }

  const bytes: number[] = [];
  for (const g of groups) {
    bytes.push((g >>> 8) & 0xff, g & 0xff);
  }
  return bytes;
}
