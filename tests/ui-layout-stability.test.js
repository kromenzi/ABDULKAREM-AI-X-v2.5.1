const fs = require('fs');
const assert = require('assert');

const css = fs.readFileSync('src/styles.css','utf8').replace(/\r\n/g,'\n');
const ui = fs.readFileSync('src/main.jsx','utf8').replace(/\r\n/g,'\n');

function has(re, message) { assert.ok(re.test(css), message); }

// v2.6 intentionally preserves the Codex-fixed v2.5.1 renderer. These checks
// validate that baseline instead of re-introducing the obsolete horizontal rail.
has(/body\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?\}/, 'page-level overflow guard missing');
has(/\.app-shell\s*\{[\s\S]*?height:\s*100vh;[\s\S]*?grid-template-rows:\s*66px\s+1fr;[\s\S]*?\}/, 'app shell viewport grid missing');
has(/\.layout\s*\{[\s\S]*?grid-template-columns:\s*220px\s+minmax\(420px,\s*1fr\)\s+290px;[\s\S]*?direction:\s*ltr;[\s\S]*?\}/, 'Codex-fixed desktop three-column layout missing');
has(/\.sidebar,\s*\.right-panel,\s*\.chat-panel\s*\{[\s\S]*?direction:\s*rtl;[\s\S]*?min-height:\s*0;[\s\S]*?\}/, 'RTL panel containment missing');
has(/\.chat-panel\s*\{[\s\S]*?grid-template-rows:\s*42px\s+1fr\s+auto;[\s\S]*?min-width:\s*0;[\s\S]*?\}/, 'chat panel must keep bounded composer layout');
has(/\.right-panel\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*42px\s+minmax\(180px,\s*\.7fr\)\s+minmax\(180px,\s*1fr\)\s+auto;[\s\S]*?\}/, 'Codex-fixed right panel row layout missing');
has(/\.capability-grid\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(5,1fr\);[\s\S]*?\}/, 'capability grid must remain the Codex-fixed five-column grid');
has(/\.capability-grid\s+div\s*\{[\s\S]*?min-height:\s*55px;[\s\S]*?place-items:\s*center;[\s\S]*?\}/, 'capability cells must keep stable bounded height');
has(/@media\s*\(max-width:\s*1050px\)[\s\S]*?\.layout\s*\{\s*grid-template-columns:\s*190px\s+1fr;\s*\}[\s\S]*?\.right-panel\s*\{\s*display:none;\s*\}/, 'narrow layouts must hide the right panel instead of overlapping chat');
has(/@media\s*\(max-width:\s*720px\)[\s\S]*?\.layout\s*\{\s*grid-template-columns:\s*1fr;\s*\}[\s\S]*?\.sidebar\s*\{\s*display:none;\s*\}/, 'mobile layout must collapse sidebar cleanly');
has(/Screenshot-driven overlap guards/, 'Codex screenshot-driven overlap guards missing');

assert.ok(ui.includes('right-content right-content-${rightTab}'), 'right panel content wrapper must remain isolated');
assert.ok(ui.includes('className="capability-grid"'), 'capability grid markup missing');
assert.ok(ui.includes('className="right-tabs"'), 'right tab markup missing');

console.log('ui-layout-stability.test.js PASS');
