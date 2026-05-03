#!/usr/bin/env python3
"""
download_snapgene_library.py — Download SnapGene's free plasmid .dna files (2,800+).

License: free for academic/nonprofit with attribution to snapgene.com/resources.

Downloads raw .dna binary files organized by category into folders.
Parsing/conversion is a separate step.

Usage:
  pip install requests beautifulsoup4 tqdm
  python download_snapgene_library.py
  python download_snapgene_library.py --output-dir ./snapgene_dna/
  python download_snapgene_library.py --categories basic_cloning_vectors,yeast_plasmids
  python download_snapgene_library.py --max-per-category 10
"""

import argparse
import os
import sys
import time
from pathlib import Path
from xml.etree import ElementTree as ET
from urllib.parse import quote

import requests

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("pip install beautifulsoup4")
    sys.exit(1)

try:
    from tqdm import tqdm
except ImportError:
    def tqdm(it, **kw):
        total = kw.get('total')
        desc = kw.get('desc', '')
        for i, item in enumerate(it):
            if total:
                print(f"\r  {desc} {i+1}/{total}", end='', flush=True)
            yield item
        if total:
            print()

# ═══ Config ═══

BASE_URL = "https://www.snapgene.com"
FETCH_URL = f"{BASE_URL}/local/fetch.php"
RATE_LIMIT = 0.3  # seconds between requests


def get_session():
    s = requests.Session()
    s.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0',
        'Referer': 'https://www.snapgene.com/plasmids/',
    })
    return s


def get_categories(session):
    """Scrape category slugs from main plasmids page."""
    print("Fetching categories from snapgene.com/plasmids...")
    r = session.get(f"{BASE_URL}/plasmids", timeout=15)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, 'html.parser')
    cats = []
    seen = set()
    for a in soup.find_all('a', href=True):
        href = a['href']
        if href.startswith('/plasmids/') and href.count('/') == 2:
            slug = href.split('/')[2]
            if slug and slug not in seen:
                seen.add(slug)
                cats.append(slug)
    return cats


def get_plasmid_index(session, category):
    """Get XML index of all plasmids in a category."""
    r = session.get(FETCH_URL, params={'set': category}, timeout=15)
    if r.status_code != 200 or not r.text.strip().startswith('<?xml'):
        return []
    root = ET.fromstring(r.text)
    return [
        {'name': p.get('name', ''), 'url': p.get('url', ''), 'filename': p.get('filename', '')}
        for p in root.findall('.//Plasmid')
    ]


def download_dna(session, category, plasmid_url, output_dir):
    """Download a single .dna file. Returns True if successful."""
    safe_name = plasmid_url.replace('/', '_').replace('\\', '_')
    out_path = output_dir / category / f"{safe_name}.dna"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Skip if already downloaded
    if out_path.exists() and out_path.stat().st_size > 100:
        return True

    try:
        time.sleep(RATE_LIMIT)
        r = session.get(FETCH_URL, params={'set': category, 'plasmid': plasmid_url}, timeout=20)
        if r.status_code == 200 and len(r.content) > 20 and r.content[0] == 0x09:
            out_path.write_bytes(r.content)
            return True
        elif r.status_code == 503:
            # Retry once after longer delay
            time.sleep(2)
            r = session.get(FETCH_URL, params={'set': category, 'plasmid': plasmid_url}, timeout=20)
            if r.status_code == 200 and len(r.content) > 20 and r.content[0] == 0x09:
                out_path.write_bytes(r.content)
                return True
    except requests.exceptions.Timeout:
        pass
    except Exception as e:
        print(f"\n    Error: {plasmid_url}: {e}", file=sys.stderr)
    return False


def main():
    ap = argparse.ArgumentParser(description='Download SnapGene plasmid .dna library')
    ap.add_argument('--output-dir', default='./snapgene_dna',
                    help='Directory to store .dna files (default: ./snapgene_dna/)')
    ap.add_argument('--categories', default=None,
                    help='Comma-separated category slugs (default: all)')
    ap.add_argument('--max-per-category', type=int, default=0,
                    help='Max plasmids per category, 0 = all (default: 0)')
    ap.add_argument('--list-categories', action='store_true',
                    help='Just list available categories and counts, don\'t download')
    args = ap.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    session = get_session()
    cats = get_categories(session)
    print(f"Found {len(cats)} categories\n")

    if args.categories:
        wanted = set(args.categories.split(','))
        cats = [c for c in cats if c in wanted]
        not_found = wanted - set(cats)
        if not_found:
            print(f"Warning: categories not found: {not_found}")

    # List mode
    if args.list_categories:
        total = 0
        for cat in cats:
            time.sleep(0.3)
            index = get_plasmid_index(session, cat)
            print(f"  {cat:55s} {len(index):>4}")
            total += len(index)
        print(f"\n  {'TOTAL':55s} {total:>4}")
        return

    # Download mode
    grand_total = 0
    grand_ok = 0
    grand_fail = 0
    grand_skip = 0

    for cat in cats:
        time.sleep(0.5)
        index = get_plasmid_index(session, cat)
        if not index:
            print(f"  {cat}: empty or error, skipping")
            continue

        if args.max_per_category > 0:
            index = index[:args.max_per_category]

        # Check how many already downloaded
        cat_dir = output_dir / cat
        existing = set()
        if cat_dir.exists():
            existing = {f.stem for f in cat_dir.glob('*.dna')}

        to_download = [p for p in index if p['url'] not in existing]
        already = len(index) - len(to_download)

        print(f"\n{cat}: {len(index)} plasmids ({already} already downloaded, {len(to_download)} to go)")

        ok = fail = 0
        for p in tqdm(to_download, desc=f"  {cat}", total=len(to_download)):
            if download_dna(session, cat, p['url'], output_dir):
                ok += 1
            else:
                fail += 1

        grand_total += len(index)
        grand_ok += ok + already
        grand_fail += fail
        if fail:
            print(f"  Downloaded: {ok}, Failed: {fail}, Already had: {already}")

    # Summary
    total_files = sum(1 for _ in output_dir.rglob('*.dna'))
    total_size = sum(f.stat().st_size for f in output_dir.rglob('*.dna'))

    print(f"\n{'='*60}")
    print(f"DONE")
    print(f"{'='*60}")
    print(f"Total .dna files on disk: {total_files}")
    print(f"Total size: {total_size / 1024 / 1024:.1f} MB")
    print(f"Location: {output_dir.resolve()}")
    print(f"\nBreakdown by category:")
    for cat_dir in sorted(output_dir.iterdir()):
        if cat_dir.is_dir():
            count = sum(1 for _ in cat_dir.glob('*.dna'))
            size = sum(f.stat().st_size for f in cat_dir.glob('*.dna'))
            print(f"  {cat_dir.name:55s} {count:>4} files  {size/1024:.0f} KB")


if __name__ == '__main__':
    main()
