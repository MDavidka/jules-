const openingMarker = /<\s*\/?\s*\|?\s*DSML\b/i;
const toolBlock = /<\s*\/?\s*\|?\s*DSML\s*\|?\s*\/?\s*toolcalls?\s*>[\s\S]*?(?:<\s*\/\s*\|?\s*DSML\s*\|?\s*\/?\s*toolcalls?\s*>|<\s*\|?\s*DSML\s*\|?\s*\/\s*toolcalls?\s*>)/gi;

function sanitizeActivityText(value) {
  if (!value) return null;
  if (!openingMarker.test(value)) return value;
  let sanitized = value.replace(toolBlock, "");
  if (openingMarker.test(sanitized)) sanitized = sanitized.slice(0, sanitized.search(openingMarker));
  return sanitized.replace(/\n{3,}/g, "\n\n").trim() || null;
}

const complete = `Before\n< | DSML | toolcalls>\n< | DSML | invoke name="mcp">\n< | DSML | parameter name="command">secret\n< | DSML | /toolcalls>\nAfter`;
const incomplete = `Before\n< | DSML | toolcalls>\n< | DSML | invoke name="mcp">\nsecret`;
const slashSeparated = `Before\n< / DSML / toolcalls>\n< / DSML / invoke name="mcpsshexec">\n< / DSML / parameter name="command" string="true">cd /tmp && git clone https://github.com/MDavidka/sarra.git< / DSML / parameter>\n< / DSML / invoke>\n< / DSML / toolcalls>\nAfter`;

if (sanitizeActivityText(complete) !== "Before\n\nAfter") throw new Error("complete DSML block was not removed");
if (sanitizeActivityText(incomplete) !== "Before") throw new Error("incomplete DSML block was not removed");
if (sanitizeActivityText(slashSeparated) !== "Before\n\nAfter") throw new Error("slash-separated DSML block was not removed");
if (sanitizeActivityText("normal response") !== "normal response") throw new Error("normal text was changed");
console.log("sanitizeActivityText regression checks passed");
