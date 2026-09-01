const fs = require('fs');
const assert = require('assert');

const css = fs.readFileSync('src/styles.css','utf8').replace(/\r\n/g,'\n');
const ui = fs.readFileSync('src/main.jsx','utf8').replace(/\r\n/g,'\n');

function has(re, message) { assert.ok(re.test(css), message); }

has(/\.layout\s*\{[\s\S]*?grid-template-columns:\s*220px\s+minmax\(0,\s*1fr\)\s+clamp\(320px,\s*24vw,\s*390px\);[\s\S]*?overflow:\s*hidden;[\s\S]*?\}/, 'desktop layout must reserve a bounded right rail and clip overflow');
has(/\.right-panel\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?grid-template-rows:\s*42px\s+minmax\(0,\s*1fr\)\s+72px;[\s\S]*?\}/, 'right panel must reserve a fixed capability rail');
has(/\.right-tabs\s*\{[\s\S]*?overflow-x:\s*auto;[\s\S]*?white-space:\s*nowrap;[\s\S]*?\}/, 'right tabs must scroll instead of overlap');
has(/\.right-content\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?\}/, 'right content must not paint over capability rail');
has(/\.capability-grid\s*\{[\s\S]*?height:\s*72px;[\s\S]*?display:\s*flex;[\s\S]*?overflow-x:\s*auto;[\s\S]*?overflow-y:\s*hidden;[\s\S]*?\}/, 'capability area must be a fixed horizontal rail');
has(/\.capability-grid\s+div\s*\{[\s\S]*?flex:\s*0\s+0\s+78px;[\s\S]*?\}/, 'capability icons need stable non-overlapping cells');
has(/\.context-strip\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?\}/, 'context strip must clip router/model overflow');
has(/Screenshot-driven overlap guards/, 'screenshot-driven Windows overlap guards missing');
has(/@media\s*\(max-width:\s*1280px\)[\s\S]*?\.right-panel\s*\{\s*grid-template-rows:\s*42px\s+minmax\(0,\s*1fr\)\s+68px;/, '1280px layout must keep a compact capability rail');
has(/@media\s*\(max-width:\s*1050px\)[\s\S]*?\.right-panel\s*\{\s*display:\s*none;/, 'narrow layouts must hide the right rail rather than overlap chat');

assert.ok(ui.includes('right-content right-content-${rightTab}'), 'right panel content wrapper must remain isolated');
assert.ok(ui.includes('className="capability-grid"'), 'capability rail markup missing');
assert.ok(ui.includes('className="right-tabs"'), 'right tab rail markup missing');

console.log('ui-layout-stability.test.js PASS');
