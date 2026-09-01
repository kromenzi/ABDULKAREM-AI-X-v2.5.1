const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

function splitCsv(v='') { return String(v || '').split(',').map(x=>x.trim()).filter(Boolean); }
function parseSkillText(text, filePath='') {
  const raw = String(text || '');
  const m = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  const meta = {};
  let body = raw;
  if (m) {
    body = m[2].trim();
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i <= 0) continue;
      meta[line.slice(0,i).trim()] = line.slice(i+1).trim();
    }
  }
  return {
    name: meta.name || path.basename(filePath,'.md'),
    description: meta.description || '',
    agents: splitCsv(meta.agents),
    tools: splitCsv(meta.tools),
    keywords: splitCsv(meta.keywords),
    priority: Number(meta.priority || 50),
    body,
    filePath
  };
}

async function loadSkills(dirs=[]) {
  const seen = new Map();
  for (const dir of dirs) {
    if (!dir) continue;
    let entries=[]; try { entries = await fsp.readdir(dir,{withFileTypes:true}); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile() || !e.name.toLowerCase().endsWith('.md')) continue;
      const p = path.join(dir,e.name);
      try {
        const skill = parseSkillText(await fsp.readFile(p,'utf8'),p);
        if (skill.name) seen.set(skill.name,skill);
      } catch {}
    }
  }
  return [...seen.values()].sort((a,b)=>b.priority-a.priority || a.name.localeCompare(b.name));
}

function scoreSkill(skill, query='', agentId='', mode='chat') {
  const q = String(query || '').toLowerCase();
  let score = Number(skill.priority || 0) / 100;
  if (skill.agents.includes(agentId)) score += 4;
  if (skill.agents.includes('orchestrator') && agentId === 'orchestrator') score += 2;
  for (const kw of skill.keywords || []) if (kw && q.includes(kw.toLowerCase())) score += 3;
  if (mode === 'code' && skill.name.includes('coding')) score += 5;
  if (mode === 'research' && skill.name.includes('research')) score += 5;
  if (mode === 'office' && skill.name.includes('office')) score += 5;
  if (mode === 'knowledge' && skill.name.includes('data')) score += 2;
  if (skill.name === 'saudi-communication') score += 1;
  return score;
}

function selectSkills(skills, query='', agentId='', mode='chat', limit=4) {
  return [...skills]
    .map(skill=>({skill,score:scoreSkill(skill,query,agentId,mode)}))
    .filter(x=>x.score>1.2)
    .sort((a,b)=>b.score-a.score)
    .slice(0,Math.max(1,limit))
    .map(x=>x.skill);
}

function skillsPrompt(skills=[]) {
  if (!skills.length) return '';
  return `\n\n[SKILLS LOADED]\n${skills.map(s=>`## ${s.name}\n${s.body}`).join('\n\n')}`;
}

module.exports = { parseSkillText, loadSkills, selectSkills, skillsPrompt };
