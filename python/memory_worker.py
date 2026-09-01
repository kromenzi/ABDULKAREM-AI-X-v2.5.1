import json, os, re, sqlite3, sys, hashlib
from datetime import datetime, timezone


def now(): return datetime.now(timezone.utc).isoformat()

def connect(db_path):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    con=sqlite3.connect(db_path)
    con.row_factory=sqlite3.Row
    con.execute('PRAGMA journal_mode=WAL')
    con.execute('PRAGMA synchronous=NORMAL')
    con.executescript('''
    CREATE TABLE IF NOT EXISTS memories(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL DEFAULT 'global',
      project TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'note',
      content TEXT NOT NULL,
      normalized TEXT NOT NULL DEFAULT '',
      importance INTEGER NOT NULL DEFAULT 50,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_used_at TEXT,
      use_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE(scope, project, kind, normalized)
    );
    CREATE INDEX IF NOT EXISTS idx_mem_scope ON memories(scope, project, kind);
    CREATE INDEX IF NOT EXISTS idx_mem_updated ON memories(updated_at DESC);
    ''')
    try:
        con.execute("CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(content, normalized, content='memories', content_rowid='id', tokenize='unicode61')")
        con.executescript('''
        CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
          INSERT INTO memories_fts(rowid,content,normalized) VALUES(new.id,new.content,new.normalized);
        END;
        CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
          INSERT INTO memories_fts(memories_fts,rowid,content,normalized) VALUES('delete',old.id,old.content,old.normalized);
        END;
        CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
          INSERT INTO memories_fts(memories_fts,rowid,content,normalized) VALUES('delete',old.id,old.content,old.normalized);
          INSERT INTO memories_fts(rowid,content,normalized) VALUES(new.id,new.content,new.normalized);
        END;
        ''')
    except sqlite3.OperationalError:
        pass
    return con

def norm(s):
    s=str(s or '').strip()
    s=re.sub(r'\s+',' ',s)
    return s[:12000]

def project_key(p):
    p=os.path.abspath(str(p or '')) if p else ''
    return p.lower() if os.name=='nt' else p

def add(con, payload):
    content=norm(payload.get('content'))
    if not content: return {'success':False,'error':'content is required'}
    scope=payload.get('scope') or ('project' if payload.get('project') else 'global')
    project=project_key(payload.get('project')) if scope=='project' else ''
    kind=str(payload.get('kind') or 'note')[:40]
    importance=max(1,min(100,int(payload.get('importance') or 50)))
    source=str(payload.get('source') or 'manual')[:40]
    normalized=norm(content).lower()
    t=now()
    con.execute('''INSERT INTO memories(scope,project,kind,content,normalized,importance,source,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(scope,project,kind,normalized) DO UPDATE SET importance=max(importance,excluded.importance), updated_at=excluded.updated_at, source=excluded.source''',
      (scope,project,kind,content,normalized,importance,source,t,t))
    con.commit()
    row=con.execute('SELECT * FROM memories WHERE scope=? AND project=? AND kind=? AND normalized=?',(scope,project,kind,normalized)).fetchone()
    return {'success':True,'memory':dict(row)}

def tokenize(q):
    return [x for x in re.findall(r'[\w\u0600-\u06FF]+', str(q or '').lower()) if len(x)>1][:12]

def search(con,payload):
    q=norm(payload.get('query'))
    limit=max(1,min(30,int(payload.get('limit') or 8)))
    project=project_key(payload.get('project'))
    include_global=payload.get('include_global',True) is not False
    rows=[]
    tokens=tokenize(q)
    where="(scope='global' OR (scope='project' AND project=?))" if include_global and project else ("scope='project' AND project=?" if project else "scope='global'")
    params=[project] if project else []
    # FTS first
    if tokens:
        try:
            fts=' OR '.join('"'+t.replace('"','')+'"' for t in tokens)
            sql=f'''SELECT m.*, bm25(memories_fts) AS bm FROM memories_fts JOIN memories m ON m.id=memories_fts.rowid WHERE memories_fts MATCH ? AND {where} ORDER BY bm ASC, m.importance DESC, m.updated_at DESC LIMIT ?'''
            rows=[dict(r) for r in con.execute(sql,[fts,*params,limit]).fetchall()]
        except Exception:
            rows=[]
    if len(rows)<limit:
        seen={r['id'] for r in rows}
        like_terms=tokens[:4]
        clauses=[]; p=[]
        for t in like_terms:
            clauses.append('normalized LIKE ?'); p.append('%'+t+'%')
        term_sql=(' AND ('+' OR '.join(clauses)+')') if clauses else ''
        sql=f'''SELECT * FROM memories WHERE {where}{term_sql} ORDER BY importance DESC, use_count DESC, updated_at DESC LIMIT ?'''
        for r in con.execute(sql,[*params,*p,limit*2]).fetchall():
            d=dict(r)
            if d['id'] not in seen:
                rows.append(d); seen.add(d['id'])
                if len(rows)>=limit: break
    if not rows:
        # Context prior: when lexical wording differs, return a small set of the
        # highest-value memories for the active project/global profile. The LLM
        # still receives an instruction to use only memories relevant to the request.
        sql=f'''SELECT * FROM memories WHERE {where} ORDER BY CASE WHEN scope='project' THEN 0 ELSE 1 END, importance DESC, use_count DESC, updated_at DESC LIMIT ?'''
        rows=[dict(r) for r in con.execute(sql,[*params,min(limit,4)]).fetchall()]
        for r in rows: r['retrieval']='context-prior'
    ids=[r['id'] for r in rows]
    if ids:
        marks=','.join('?'*len(ids))
        con.execute(f'UPDATE memories SET use_count=use_count+1,last_used_at=? WHERE id IN ({marks})',[now(),*ids]); con.commit()
    return {'success':True,'query':q,'results':rows[:limit]}

def list_mem(con,payload):
    limit=max(1,min(200,int(payload.get('limit') or 100)))
    project=project_key(payload.get('project'))
    scope=payload.get('scope')
    clauses=[]; p=[]
    if scope: clauses.append('scope=?'); p.append(scope)
    if project: clauses.append("(scope='global' OR project=?)"); p.append(project)
    where=' WHERE '+' AND '.join(clauses) if clauses else ''
    rows=[dict(r) for r in con.execute(f'SELECT * FROM memories{where} ORDER BY importance DESC, updated_at DESC LIMIT ?',[*p,limit]).fetchall()]
    return {'success':True,'results':rows}

def delete_mem(con,payload):
    mid=payload.get('id')
    if mid:
        cur=con.execute('DELETE FROM memories WHERE id=?',(int(mid),)); con.commit(); return {'success':True,'deleted':cur.rowcount}
    scope=payload.get('scope'); project=project_key(payload.get('project'))
    if scope=='project' and project:
        cur=con.execute("DELETE FROM memories WHERE scope='project' AND project=?",(project,)); con.commit(); return {'success':True,'deleted':cur.rowcount}
    return {'success':False,'error':'id or project scope required'}

def clear(con,payload):
    confirm=payload.get('confirm') is True
    if not confirm: return {'success':False,'error':'confirm=true required'}
    project=project_key(payload.get('project'))
    if project:
        cur=con.execute("DELETE FROM memories WHERE scope='project' AND project=?",(project,))
    else:
        cur=con.execute('DELETE FROM memories')
    con.commit(); return {'success':True,'deleted':cur.rowcount}

def stats(con,payload):
    project=project_key(payload.get('project'))
    total=con.execute('SELECT count(*) FROM memories').fetchone()[0]
    global_count=con.execute("SELECT count(*) FROM memories WHERE scope='global'").fetchone()[0]
    project_count=con.execute("SELECT count(*) FROM memories WHERE scope='project' AND project=?",(project,)).fetchone()[0] if project else 0
    kinds={r['kind']:r['n'] for r in con.execute('SELECT kind,count(*) n FROM memories GROUP BY kind').fetchall()}
    return {'success':True,'total':total,'global':global_count,'project':project_count,'kinds':kinds,'db_path':payload.get('db_path','')}

def main():
    req=json.loads(sys.stdin.read() or '{}')
    db_path=req.get('db_path') or os.path.join(os.getcwd(),'memory.db')
    con=connect(db_path)
    action=req.get('action')
    if action=='add': out=add(con,req)
    elif action=='search': out=search(con,req)
    elif action=='list': out=list_mem(con,req)
    elif action=='delete': out=delete_mem(con,req)
    elif action=='clear': out=clear(con,req)
    elif action=='stats': out=stats(con,req)
    else: out={'success':False,'error':'unknown action'}
    print(json.dumps(out,ensure_ascii=False))

if __name__=='__main__': main()
