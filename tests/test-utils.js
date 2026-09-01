function normalizeEol(value='') {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
function textEqual(actual, expected, assert) {
  assert.equal(normalizeEol(actual), normalizeEol(expected));
}
module.exports={normalizeEol,textEqual};
