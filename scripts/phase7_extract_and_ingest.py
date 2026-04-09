#!/usr/bin/env python3

import argparse
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from pypdf import PdfReader


def load_env_file() -> None:
    env_path = Path('.env')
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue

        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip())


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f'Missing required environment variable: {name}')
    return value


def http_json(method: str, url: str, headers: dict[str, str], payload: dict | None = None) -> dict:
    data = None
    request_headers = dict(headers)

    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        request_headers['Content-Type'] = 'application/json'

    request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.loads(response.read().decode('utf-8'))


def get_document(document_id: str, supabase_url: str, service_role_key: str) -> dict:
    query = urllib.parse.quote(f'id=eq.{document_id}&select=*', safe='=&.,')
    url = f'{supabase_url}/rest/v1/documents?{query}'
    headers = {
        'Authorization': f'Bearer {service_role_key}',
        'apikey': service_role_key,
        'Accept': 'application/json',
    }
    response = http_json('GET', url, headers)

    if not response:
        raise RuntimeError(f'Document {document_id} not found in Supabase')

    return response[0]


def delete_existing_chunks(document_id: str, supabase_url: str, service_role_key: str) -> None:
    url = f'{supabase_url}/rest/v1/chunks?document_id=eq.{document_id}'
    headers = {
        'Authorization': f'Bearer {service_role_key}',
        'apikey': service_role_key,
        'Prefer': 'return=minimal',
    }
    request = urllib.request.Request(url, headers=headers, method='DELETE')
    with urllib.request.urlopen(request, timeout=300):
        return


def download_pdf(file_path: str, supabase_url: str, service_role_key: str) -> bytes:
    encoded_path = urllib.parse.quote(file_path, safe='/')
    url = f'{supabase_url}/storage/v1/object/manuals/{encoded_path}'
    headers = {
        'Authorization': f'Bearer {service_role_key}',
        'apikey': service_role_key,
    }
    request = urllib.request.Request(url, headers=headers, method='GET')
    with urllib.request.urlopen(request, timeout=300) as response:
        return response.read()


def clean_text(text: str) -> str:
    text = text.replace('\x00', '')
    text = re.sub(r'[ \t]+\n', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def find_section_heading(text: str, fallback: str | None) -> str | None:
    for line in text.splitlines():
      line = line.strip()
      if re.match(r'^\d+(\.\d+)*\s+.+', line):
          return line
      if line.isupper() and 4 <= len(line) <= 90:
          return line.title()

    return fallback


def extract_elements(pdf_bytes: bytes) -> list[dict]:
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as handle:
        handle.write(pdf_bytes)
        temp_path = handle.name

    try:
        reader = PdfReader(temp_path)
        elements: list[dict] = []
        current_section: str | None = None

        for index, page in enumerate(reader.pages, start=1):
            page_text = clean_text(page.extract_text() or '')
            if not page_text:
                continue

            current_section = find_section_heading(page_text, current_section)
            elements.append(
                {
                    'content': page_text,
                    'content_type': 'NARRATIVE_TEXT',
                    'section_path': current_section,
                    'page_numbers': [index],
                    'metadata': {
                        'source': 'phase7-pypdf',
                    },
                }
            )

        if not elements:
            raise RuntimeError('No text extracted from PDF')

        return elements
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass


def post_ingestion(document_id: str, elements: list[dict], server_url: str) -> dict:
    url = f'{server_url.rstrip("/")}/api/ingest/process'
    payload = {
        'documentId': document_id,
        'elements': elements,
    }
    return http_json('POST', url, {'Accept': 'application/json'}, payload)


def get_status(document_id: str, server_url: str) -> dict:
    query = urllib.parse.urlencode({'documentId': document_id})
    url = f'{server_url.rstrip("/")}/api/ingest/status?{query}'
    return http_json('GET', url, {'Accept': 'application/json'})


def main() -> int:
    parser = argparse.ArgumentParser(description='Phase 7 local ingestion helper')
    parser.add_argument('--document-id', required=True)
    parser.add_argument('--server-url', default='http://127.0.0.1:3001')
    parser.add_argument('--keep-existing', action='store_true')
    args = parser.parse_args()

    load_env_file()

    supabase_url = require_env('NEXT_PUBLIC_SUPABASE_URL')
    service_role_key = require_env('SUPABASE_SERVICE_ROLE_KEY')

    document = get_document(args.document_id, supabase_url, service_role_key)

    if not args.keep_existing:
        delete_existing_chunks(args.document_id, supabase_url, service_role_key)

    pdf_bytes = download_pdf(document['file_path'], supabase_url, service_role_key)
    elements = extract_elements(pdf_bytes)
    ingestion_result = post_ingestion(args.document_id, elements, args.server_url)
    status_result = get_status(args.document_id, args.server_url)

    output = {
        'document': {
            'id': document['id'],
            'title': document['title'],
            'file_path': document['file_path'],
        },
        'extracted_pages': len(elements),
        'ingestion': ingestion_result,
        'status': status_result,
    }

    print(json.dumps(output, indent=2))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', errors='replace')
        print(detail, file=sys.stderr)
        raise
