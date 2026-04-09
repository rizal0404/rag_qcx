import { NextRequest, NextResponse } from 'next/server'

function isApiRequest(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

function getAdminCredentials() {
  const username = process.env.ADMIN_BASIC_AUTH_USERNAME?.trim()
  const password = process.env.ADMIN_BASIC_AUTH_PASSWORD?.trim()

  if (!username || !password) {
    return null
  }

  return { username, password }
}

function parseBasicAuthHeader(headerValue: string | null): { username: string; password: string } | null {
  if (!headerValue?.startsWith('Basic ')) {
    return null
  }

  const encoded = headerValue.slice('Basic '.length).trim()

  if (!encoded) {
    return null
  }

  try {
    const decoded = atob(encoded)
    const separatorIndex = decoded.indexOf(':')

    if (separatorIndex < 0) {
      return null
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    }
  } catch {
    return null
  }
}

function unauthorizedResponse(request: NextRequest): NextResponse {
  if (isApiRequest(request.nextUrl.pathname)) {
    return NextResponse.json(
      { error: 'Authentication required' },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Admin Area"',
        },
      },
    )
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="Admin Area"',
    },
  })
}

function misconfiguredResponse(request: NextRequest): NextResponse {
  const message =
    'Admin authentication is not configured. Set ADMIN_BASIC_AUTH_USERNAME and ADMIN_BASIC_AUTH_PASSWORD.'

  if (isApiRequest(request.nextUrl.pathname)) {
    return NextResponse.json({ error: message }, { status: 503 })
  }

  return new NextResponse(message, {
    status: 503,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}

export function middleware(request: NextRequest) {
  const credentials = getAdminCredentials()

  if (!credentials) {
    return misconfiguredResponse(request)
  }

  const providedCredentials = parseBasicAuthHeader(request.headers.get('authorization'))

  if (
    providedCredentials?.username === credentials.username &&
    providedCredentials.password === credentials.password
  ) {
    return NextResponse.next()
  }

  return unauthorizedResponse(request)
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/documents/:path*',
    '/api/ingest/:path*',
    '/api/chat/sessions/:path*',
  ],
}
