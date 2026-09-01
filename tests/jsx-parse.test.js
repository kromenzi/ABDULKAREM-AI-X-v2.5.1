const fs = require('fs');
const ts = require('typescript');
const file = 'src/main.jsx';
const source = fs.readFileSync(file,'utf8');
const parsed = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
if (parsed.parseDiagnostics.length) {
  for (const d of parsed.parseDiagnostics) {
    const pos=parsed.getLineAndCharacterOfPosition(d.start||0);
    console.error(`${pos.line+1}:${pos.character+1} ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`);
  }
  process.exit(1);
}
console.log(JSON.stringify({ok:true,jsxParseErrors:0}));
