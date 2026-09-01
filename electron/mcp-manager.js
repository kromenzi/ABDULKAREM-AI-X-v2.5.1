const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

class McpManager {
  constructor({ configPath, onEvent }={}) {
    this.configPath = configPath;
    this.onEvent = typeof onEvent === 'function' ? onEvent : ()=>{};
    this.connections = new Map();
  }
  async ensureConfig() {
    if (!this.configPath) throw new Error('MCP config path is not configured.');
    await fsp.mkdir(path.dirname(this.configPath),{recursive:true});
    if (!fs.existsSync(this.configPath)) {
      await fsp.writeFile(this.configPath, JSON.stringify({ version:1, servers:[] },null,2),'utf8');
    }
  }
  async readConfig() {
    await this.ensureConfig();
    try {
      const parsed = JSON.parse(await fsp.readFile(this.configPath,'utf8'));
      return { version:1, servers:Array.isArray(parsed.servers)?parsed.servers:[] };
    } catch { return { version:1, servers:[] }; }
  }
  async writeConfig(config) {
    await this.ensureConfig();
    const clean = { version:1, servers:(config.servers || []).map(s=>({
      name:String(s.name||'').trim(), command:String(s.command||'').trim(), args:Array.isArray(s.args)?s.args.map(String):[], env:s.env&&typeof s.env==='object'?s.env:{}, enabled:s.enabled!==false
    })).filter(s=>s.name&&s.command) };
    await fsp.writeFile(this.configPath,JSON.stringify(clean,null,2),'utf8');
    return clean;
  }
  async status() {
    const cfg = await this.readConfig();
    return {
      configured: cfg.servers.length,
      enabled: cfg.servers.filter(x=>x.enabled!==false).length,
      connected: [...this.connections.keys()],
      servers: cfg.servers.map(s=>({name:s.name,command:s.command,args:s.args,enabled:s.enabled!==false,connected:this.connections.has(s.name)}))
    };
  }
  async addServer(server) {
    const cfg = await this.readConfig();
    const next = cfg.servers.filter(x=>x.name!==server.name);
    next.push({...server,enabled:server.enabled!==false});
    await this.disconnect(server.name).catch(()=>{});
    await this.writeConfig({servers:next});
    return this.status();
  }
  async removeServer(name) {
    const cfg = await this.readConfig();
    await this.disconnect(name).catch(()=>{});
    await this.writeConfig({servers:cfg.servers.filter(x=>x.name!==name)});
    return this.status();
  }
  async connect(name) {
    if (this.connections.has(name)) return this.connections.get(name);
    const cfg = await this.readConfig();
    const server = cfg.servers.find(x=>x.name===name && x.enabled!==false);
    if (!server) throw new Error(`MCP server not found or disabled: ${name}`);
    let Client, StdioClientTransport;
    try {
      ({ Client } = await import('@modelcontextprotocol/sdk/client/index.js'));
      ({ StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js'));
    } catch (e) {
      throw new Error('MCP SDK is not installed. Run npm install in ABDULKAREM AI X v2.5.');
    }
    const transport = new StdioClientTransport({ command:server.command, args:server.args || [], env:{...process.env,...(server.env||{})} });
    const client = new Client({ name:'abdulkarem-ai-x', version:'2.5.1' }, { capabilities:{} });
    this.onEvent('MCP Connect',name,'running');
    await client.connect(transport);
    const state={client,transport,server};
    this.connections.set(name,state);
    this.onEvent('MCP Connect',name,'done');
    return state;
  }
  async disconnect(name) {
    const state=this.connections.get(name);
    if (!state) return false;
    this.connections.delete(name);
    try { await state.client.close(); } catch {}
    try { await state.transport.close(); } catch {}
    return true;
  }
  async closeAll() { for (const name of [...this.connections.keys()]) await this.disconnect(name).catch(()=>{}); }
  async listTools(name) {
    const state=await this.connect(name);
    const result=await state.client.listTools();
    return { success:true, server:name, tools:result.tools || [] };
  }
  async callTool(name, toolName, args={}) {
    const state=await this.connect(name);
    this.onEvent('MCP Tool',`${name}:${toolName}`,'running');
    const result=await state.client.callTool({ name:toolName, arguments:args || {} });
    this.onEvent('MCP Tool',`${name}:${toolName}`,'done');
    return { success:result?.isError!==true, server:name, tool:toolName, content:result?.content || [], structuredContent:result?.structuredContent || null, isError:Boolean(result?.isError) };
  }
}
module.exports = { McpManager };
