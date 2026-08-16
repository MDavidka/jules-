const openingMarker = /<\s*\|?\s*DSML\b/i;
const toolBlock = /<\s*\|?\s*DSML\s*\|?\s*toolcalls?\s*>[\s\S]*?(?:<\s*\/\s*\|?\s*DSML\s*\|?\s*toolcalls?\s*>|<\s*\|?\s*DSML\s*\|?\s*\/\s*toolcalls?\s*>)/gi;

function sanitizeActivityText(value) {
  if (!value) return null;
  if (!openingMarker.test(value)) return value;
  let sanitized = value.replace(toolBlock, "");
  if (openingMarker.test(sanitized)) sanitized = sanitized.slice(0, sanitized.search(openingMarker));
  return sanitized.replace(/\n{3,}/g, "\n\n").trim() || null;
}

const complete = `Before\n< | DSML | toolcalls>\n< | DSML | invoke name="mcp">\n< | DSML | parameter name="command">secret\n< | DSML | /toolcalls>\nAfter`;
const incomplete = `Before\n< | DSML | toolcalls>\n< | DSML | invoke name="mcp">\nsecret`;

if (sanitizeActivityText(complete) !== "Before\n\nAfter") throw new Error("complete DSML block was not removed");
if (sanitizeActivityText(incomplete) !== "Before") throw new Error("incomplete DSML block was not removed");
if (sanitizeActivityText("normal response") !== "normal response") throw new Error("normal text was changed");
console.log("sanitizeActivityText regression checks passed");
