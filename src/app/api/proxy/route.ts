import { NextRequest, NextResponse } from 'next/server';

const UPSTREAM_BASE_URL = 'https://technocore.chat';

const ALLOWED_PATH_PREFIXES = [
  '/rooms',
  '/r/',
  '/.well-known/',
  '/openapi.json',
  '/config',
  '/healthz',
  '/llms.txt',
  '/kv/',
];

/** Strict path check: exact/prefix-boundary match + no dot-segment traversal. */
function isAllowedPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  let normalized: string;
  try {
    // Decode once for inspection; reject double-encoding and backslashes.
    normalized = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (/%|\\/.test(normalized)) return false;
  const segments = normalized.split('/');
  if (segments.includes('.') || segments.includes('..')) return false;
  return ALLOWED_PATH_PREFIXES.some((p) => {
    if (p.endsWith('/')) return normalized.startsWith(p);
    return normalized === p || normalized.startsWith(`${p}/`) || normalized.startsWith(`${p}?`);
  });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'Missing required `path` query parameter' }, { status: 400 });
  }

  if (!isAllowedPath(path)) {
    return NextResponse.json({ error: `Forbidden path: ${path}` }, { status: 403 });
  }

  const forwardParams = new URLSearchParams();
  searchParams.forEach((val, key) => {
    if (key !== 'path') forwardParams.set(key, val);
  });

  const queryString = forwardParams.toString();
  const upstreamUrl = `${UPSTREAM_BASE_URL}${path}${queryString ? `?${queryString}` : ''}`;

  const waitVal = forwardParams.get('wait');
  const timeoutMs = waitVal ? (parseInt(waitVal, 10) + 5) * 1000 : 30000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'CoreSwarm/1.0',
        Accept: 'application/json, text/plain, */*',
      },
    });

    clearTimeout(timeoutId);
    const body = await upstreamRes.text();
    const contentType = upstreamRes.headers.get('content-type') || 'application/json; charset=utf-8';

    return new NextResponse(body, {
      status: upstreamRes.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if ((err as Error)?.name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream gateway timeout', path }, { status: 504 });
    }
    return NextResponse.json(
      { error: `Connection failure: ${(err as Error)?.message || String(err)}`, path },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const path = searchParams.get('path');

  if (!path || !isAllowedPath(path)) {
    return NextResponse.json({ error: `Forbidden or invalid path: ${path}` }, { status: 403 });
  }

  // Forward only non-routing params (strip ?path= itself, like GET does).
  const forwardParams = new URLSearchParams();
  searchParams.forEach((val, key) => {
    if (key !== 'path') forwardParams.set(key, val);
  });
  const queryString = forwardParams.toString();
  const upstreamUrl = `${UPSTREAM_BASE_URL}${path}${queryString ? `?${queryString}` : ''}`;

  let requestBody = '';
  try {
    requestBody = await request.text();
  } catch {
    // empty
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      body: requestBody,
      signal: controller.signal,
      headers: {
        'User-Agent': 'CoreSwarm/1.0',
        'Content-Type': request.headers.get('content-type') || 'application/json',
        Accept: 'application/json, text/plain, */*',
      },
    });

    clearTimeout(timeoutId);
    const body = await upstreamRes.text();
    const contentType = upstreamRes.headers.get('content-type') || 'application/json; charset=utf-8';

    return new NextResponse(body, {
      status: upstreamRes.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if ((err as Error)?.name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream write timeout', path }, { status: 504 });
    }
    return NextResponse.json(
      { error: `Write failed: ${(err as Error)?.message || String(err)}`, path },
      { status: 502 },
    );
  }
}
