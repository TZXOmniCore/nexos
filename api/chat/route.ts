import { NextRequest, NextResponse } from 'next/server';

type AuthenticatedRequest = NextRequest & {
  user?: {
    id: string;
  };
};

function getUserIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as Record<string, unknown>).userId;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function getAuthenticatedUserId(req: AuthenticatedRequest): string | null {
  if (req.user?.id) return req.user.id;

  const headerId = req.headers.get('x-user-id');
  if (headerId && headerId.trim()) return headerId.trim();

  return null;
}

export async function POST(req: NextRequest) {
  const authReq = req as AuthenticatedRequest;
  const body = await req.json().catch(() => null);

  const userId = getUserIdFromBody(body);
  const authenticatedUserId = getAuthenticatedUserId(authReq);

  if (!userId || !authenticatedUserId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  if (userId !== authenticatedUserId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
