import sys, os, json, sqlite3, math, re, hashlib, traceback
from pathlib import Path
from datetime import datetime

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from office_worker import inspect_file

SUPPORTED_EXTS = {
    '.pdf','.docx','.xlsx','.xlsm','.pptx','.csv','.txt','.md','.json','.xml','.html','.css','.js','.jsx','.ts','.tsx','.py','.ps1','.bat','.cmd','.yml','.yaml','.toml','.ini','.env','.sql','.java','.cs','.cpp','.c','.h','.go','.rs','.php','.rb','.sh'
}


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, default=str))
    sys.stdout.flush()


def connect(db_path: str):
    p = Path(db_path).resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(p))
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')
    conn.execute('''CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        type TEXT,
        sha256 TEXT,
        modified_at TEXT,
        indexed_at TEXT NOT NULL,
        chunk_count INTEGER NOT NULL DEFAULT 0
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        locator TEXT,
        text TEXT NOT NULL,
        norm TEXT NOT NULL,
        embedding TEXT,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
    )''')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path)')
    try:
        conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, chunk_id UNINDEXED, tokenize='unicode61')")
        fts = True
    except Exception:
        fts = False
    conn.commit()
    return conn, fts


def norm_text(s):
    return re.sub(r'\s+', ' ', str(s or '')).strip()


def split_text(text, locator, max_chars=2200, overlap=240):
    text = str(text or '').replace('\x00',' ')
    text = re.sub(r'\r\n?', '\n', text)
    paras = [p.strip() for p in re.split(r'\n{2,}', text) if p.strip()]
    if not paras:
        paras = [text.strip()] if text.strip() else []
    chunks, buf = [], ''
    for p in paras:
        candidate = p if not buf else buf + '\n\n' + p
        if len(candidate) <= max_chars:
            buf = candidate
            continue
        if buf:
            chunks.append((locator, buf))
            tail = buf[-overlap:] if overlap else ''
            buf = (tail + '\n' + p).strip()
        else:
            start = 0
            while start < len(p):
                end = min(len(p), start + max_chars)
                chunks.append((locator, p[start:end]))
                if end >= len(p): break
                start = max(0, end - overlap)
            buf = ''
    if buf:
        chunks.append((locator, buf))
    return chunks


def chunks_from_inspection(obj):
    t = obj.get('type')
    chunks = []
    if t == 'pdf':
        for p in obj.get('pages', []):
            chunks += split_text(p.get('text',''), f"page:{p.get('page')}")
            for ti, table in enumerate(p.get('tables', []) or []):
                table_text = '\n'.join('\t'.join(str(c or '') for c in row) for row in table)
                chunks += split_text(table_text, f"page:{p.get('page')}:table:{ti+1}")
    elif t == 'word':
        heading = ''
        group = []
        for p in obj.get('paragraphs', []):
            style = str(p.get('style','')).lower()
            txt = p.get('text','')
            if style.startswith('heading') and txt:
                if group:
                    chunks += split_text('\n'.join(group), f"section:{heading or 'body'}")
                    group = []
                heading = txt[:180]
            else:
                group.append(txt)
        if group:
            chunks += split_text('\n'.join(group), f"section:{heading or 'body'}")
        for ti, table in enumerate(obj.get('tables', []) or []):
            text = '\n'.join('\t'.join(str(c or '') for c in row) for row in table.get('rows', []))
            chunks += split_text(text, f"table:{ti+1}")
    elif t == 'excel':
        for sh in obj.get('sheets', []):
            rows = sh.get('rows', [])
            lines = ['\t'.join(str(c or '') for c in row) for row in rows]
            block = []
            start_row = 1
            for i, line in enumerate(lines, 1):
                block.append(line)
                if len('\n'.join(block)) >= 1900:
                    chunks.append((f"sheet:{sh.get('name')}:rows:{start_row}-{i}", '\n'.join(block)))
                    block, start_row = [], i + 1
            if block:
                chunks.append((f"sheet:{sh.get('name')}:rows:{start_row}-{len(lines)}", '\n'.join(block)))
    elif t == 'powerpoint':
        for s in obj.get('slides', []):
            text = (s.get('title','') + '\n' + s.get('text','')).strip()
            chunks += split_text(text, f"slide:{s.get('slide')}")
            for ti, table in enumerate(s.get('tables', []) or []):
                table_text = '\n'.join('\t'.join(str(c or '') for c in row) for row in table)
                chunks += split_text(table_text, f"slide:{s.get('slide')}:table:{ti+1}")
    elif t == 'csv':
        rows = obj.get('rows', [])
        lines = ['\t'.join(str(c or '') for c in row) for row in rows]
        for i in range(0, len(lines), 45):
            chunks.append((f"rows:{i+1}-{min(len(lines), i+45)}", '\n'.join(lines[i:i+45])))
    elif t == 'text':
        chunks += split_text(obj.get('content',''), 'text')
    elif t == 'zip':
        chunks += split_text('\n'.join(obj.get('entries', [])), 'archive-entries')
    clean = []
    seen = set()
    for locator, text in chunks:
        text = norm_text(text)
        if len(text) < 20:
            continue
        key = hashlib.sha1((locator + '\0' + text).encode('utf-8','ignore')).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        clean.append((locator, text))
    return clean


def expand_paths(raw_paths, max_files=2000):
    out = []
    seen = set()
    skip_dirs = {'node_modules','.git','dist','build','.next','.venv','venv','__pycache__'}
    for raw in raw_paths or []:
        p = Path(raw).resolve()
        if p.is_file():
            if p.suffix.lower() in SUPPORTED_EXTS and str(p) not in seen:
                out.append(p); seen.add(str(p))
        elif p.is_dir():
            for root, dirs, files in os.walk(p):
                dirs[:] = [d for d in dirs if d not in skip_dirs]
                for name in files:
                    fp = Path(root) / name
                    if fp.suffix.lower() in SUPPORTED_EXTS and str(fp) not in seen:
                        out.append(fp); seen.add(str(fp))
                        if len(out) >= max_files: return out
    return out[:max_files]


def index_paths(conn, fts, paths, max_files=2000):
    files = expand_paths(paths, max_files)
    indexed, skipped, failed, chunks_total = [], [], [], 0
    for p in files:
        try:
            obj = inspect_file(str(p))
            sha = obj.get('sha256') or ''
            existing = conn.execute('SELECT id, sha256 FROM documents WHERE path=?', (str(p),)).fetchone()
            if existing and existing['sha256'] == sha:
                skipped.append(str(p)); continue
            chunks = chunks_from_inspection(obj)
            now = datetime.now().isoformat(timespec='seconds')
            if existing:
                doc_id = existing['id']
                old_ids = [r['id'] for r in conn.execute('SELECT id FROM chunks WHERE document_id=?', (doc_id,)).fetchall()]
                if fts and old_ids:
                    conn.executemany('DELETE FROM chunks_fts WHERE chunk_id=?', [(x,) for x in old_ids])
                conn.execute('DELETE FROM chunks WHERE document_id=?', (doc_id,))
                conn.execute('UPDATE documents SET name=?, type=?, sha256=?, modified_at=?, indexed_at=?, chunk_count=? WHERE id=?',
                             (p.name, obj.get('type'), sha, obj.get('modified_at',''), now, len(chunks), doc_id))
            else:
                cur = conn.execute('INSERT INTO documents(path,name,type,sha256,modified_at,indexed_at,chunk_count) VALUES(?,?,?,?,?,?,?)',
                                   (str(p), p.name, obj.get('type'), sha, obj.get('modified_at',''), now, len(chunks)))
                doc_id = cur.lastrowid
            for locator, text in chunks:
                cur = conn.execute('INSERT INTO chunks(document_id,locator,text,norm) VALUES(?,?,?,?)', (doc_id, locator, text, text.casefold()))
                if fts:
                    conn.execute('INSERT INTO chunks_fts(rowid,text,chunk_id) VALUES(?,?,?)', (cur.lastrowid, text, cur.lastrowid))
            conn.commit()
            indexed.append(str(p)); chunks_total += len(chunks)
        except Exception as e:
            failed.append({'path': str(p), 'error': str(e)})
            conn.rollback()
    return {'success':True,'files_seen':len(files),'indexed':indexed,'skipped':skipped,'failed':failed,'new_chunks':chunks_total}


def lexical_search(conn, fts, query, limit=20):
    query = norm_text(query)
    if not query: return []
    rows = []
    if fts:
        terms = re.findall(r'[\w\u0600-\u06FF]+', query, flags=re.UNICODE)
        fts_query = ' OR '.join('"'+t.replace('"','')+'"' for t in terms[:12] if len(t) > 1)
        if fts_query:
            try:
                rows = conn.execute('''SELECT c.id,c.locator,c.text,d.path,d.name,d.type,bm25(chunks_fts) AS rank
                    FROM chunks_fts JOIN chunks c ON c.id=chunks_fts.chunk_id JOIN documents d ON d.id=c.document_id
                    WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?''', (fts_query, limit)).fetchall()
            except Exception:
                rows = []
    if not rows:
        low = '%' + query.casefold() + '%'
        rows = conn.execute('''SELECT c.id,c.locator,c.text,d.path,d.name,d.type,0.0 AS rank
            FROM chunks c JOIN documents d ON d.id=c.document_id WHERE c.norm LIKE ? LIMIT ?''', (low, limit)).fetchall()
    return [dict(r) | {'source':'lexical'} for r in rows]


def parse_vec(v):
    if not v: return None
    try: return json.loads(v)
    except Exception: return None


def cosine(a,b):
    if not a or not b or len(a)!=len(b): return -1.0
    dot = sum(x*y for x,y in zip(a,b)); na = math.sqrt(sum(x*x for x in a)); nb = math.sqrt(sum(y*y for y in b))
    return dot/(na*nb) if na and nb else -1.0


def semantic_search(conn, vector, limit=20):
    if not vector: return []
    scored = []
    for r in conn.execute('''SELECT c.id,c.locator,c.text,c.embedding,d.path,d.name,d.type
        FROM chunks c JOIN documents d ON d.id=c.document_id WHERE c.embedding IS NOT NULL'''):
        emb = parse_vec(r['embedding'])
        score = cosine(vector, emb)
        if score >= 0:
            item = dict(r); item.pop('embedding', None); item['score'] = score; item['source'] = 'semantic'; scored.append(item)
    scored.sort(key=lambda x:x['score'], reverse=True)
    return scored[:limit]


def rrf(lex, sem, limit=12):
    merged = {}
    for source_list in (lex, sem):
        for rank, item in enumerate(source_list, 1):
            cid = item['id']; rec = merged.setdefault(cid, dict(item) | {'rrf':0.0,'matched_by':[]})
            rec['rrf'] += 1.0/(60+rank)
            rec['matched_by'].append(item.get('source'))
            if 'score' in item: rec['semantic_score'] = item['score']
    out = list(merged.values()); out.sort(key=lambda x:x['rrf'], reverse=True)
    for i, x in enumerate(out[:limit], 1):
        x['citation'] = f"KB{i}"
        x['snippet'] = x.pop('text')[:1600]
        x.pop('rank', None)
    return out[:limit]


def status(conn, fts):
    docs = conn.execute('SELECT COUNT(*) n FROM documents').fetchone()['n']
    chunks = conn.execute('SELECT COUNT(*) n FROM chunks').fetchone()['n']
    embedded = conn.execute('SELECT COUNT(*) n FROM chunks WHERE embedding IS NOT NULL').fetchone()['n']
    latest = [dict(r) for r in conn.execute('SELECT path,name,type,chunk_count,indexed_at FROM documents ORDER BY indexed_at DESC LIMIT 8')]
    return {'success':True,'documents':docs,'chunks':chunks,'embedded_chunks':embedded,'fts':fts,'latest':latest}


def pending_embeddings(conn, limit=64):
    rows = conn.execute('SELECT id,text FROM chunks WHERE embedding IS NULL ORDER BY id LIMIT ?', (limit,)).fetchall()
    return {'success':True,'items':[{'id':r['id'],'text':r['text'][:8000]} for r in rows]}


def store_embeddings(conn, items):
    count=0
    for item in items or []:
        vec = item.get('embedding')
        if isinstance(vec, list) and vec:
            conn.execute('UPDATE chunks SET embedding=? WHERE id=?', (json.dumps(vec,separators=(',',':')), int(item['id'])))
            count += 1
    conn.commit()
    return {'success':True,'stored':count}


def clear(conn, fts):
    conn.execute('DELETE FROM chunks')
    conn.execute('DELETE FROM documents')
    if fts:
        try: conn.execute('DELETE FROM chunks_fts')
        except Exception: pass
    conn.commit()
    return {'success':True}


def main():
    payload = json.loads(sys.stdin.read() or '{}')
    db_path = payload.get('db_path') or str(Path.home()/'.abdulkarem-ai-x'/'knowledge.db')
    conn, fts = connect(db_path)
    action = payload.get('action')
    if action == 'status': result = status(conn, fts)
    elif action == 'index': result = index_paths(conn, fts, payload.get('paths') or [], int(payload.get('max_files') or 2000))
    elif action == 'lexical_search': result = {'success':True,'results':lexical_search(conn, fts, payload.get('query',''), int(payload.get('limit') or 20))}
    elif action == 'semantic_search': result = {'success':True,'results':semantic_search(conn, payload.get('vector') or [], int(payload.get('limit') or 20))}
    elif action == 'hybrid_merge': result = {'success':True,'results':rrf(payload.get('lexical') or [], payload.get('semantic') or [], int(payload.get('limit') or 12))}
    elif action == 'pending_embeddings': result = pending_embeddings(conn, int(payload.get('limit') or 64))
    elif action == 'store_embeddings': result = store_embeddings(conn, payload.get('items') or [])
    elif action == 'clear': result = clear(conn, fts)
    else: raise RuntimeError(f'Unknown action: {action}')
    conn.close(); emit(result)

if __name__ == '__main__':
    try: main()
    except Exception as e:
        sys.stderr.write(f"{type(e).__name__}: {e}\n")
        sys.stderr.write(traceback.format_exc())
        sys.exit(1)
