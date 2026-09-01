const fs=require('fs');
const assert=require('assert');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const main=fs.readFileSync('electron/main.js','utf8');
const ui=fs.readFileSync('src/main.jsx','utf8');
const install=fs.readFileSync('INSTALL-WINDOWS.ps1','utf8');
const builder=fs.readFileSync('BUILD-WINDOWS-EXE.ps1','utf8');
const util=require('./test-utils');

assert.equal(pkg.version,'2.6.0');
for(const [name,version] of Object.entries({...pkg.dependencies,...pkg.devDependencies})){
  assert.ok(version && version!=='latest',`${name} must not use latest`);
  assert.ok(/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version),`${name} must be exact-pinned, got ${version}`);
}
assert.equal(pkg.devDependencies.typescript,'5.9.2');
assert.ok(main.includes('contextIsolation: true'));
assert.ok(main.includes('nodeIntegration: false'));
assert.ok(main.includes('sandbox: true'));
assert.ok(ui.includes("const Editor = React.lazy(() => import('@monaco-editor/react'))"));
assert.ok(ui.includes('window.abdx ? <App /> : <DesktopRuntimeRequired />'));
assert.ok(ui.includes('Desktop Runtime Required'));
assert.ok(install.includes('npm ci') || install.includes('& $NpmExe ci'));
assert.ok(builder.includes('npm ci') || builder.includes('& $npm.Source ci'));
assert.ok(fs.existsSync('FREEZE-DEPENDENCIES.ps1'));
assert.ok(fs.existsSync('tests/ui-layout-stability.test.js'));
assert.ok(fs.readFileSync('src/styles.css','utf8').includes('Screenshot-driven overlap guards'));
assert.equal(util.normalizeEol('a\r\nb\r\n'),'a\nb\n');
assert.ok(main.includes("const PROTECTED_OLLAMA_MODELS = new Set(['qwen3-coder:30b'])"));
assert.ok(!main.includes('ollama rm'));
console.log('windows-stability.test.js PASS');
