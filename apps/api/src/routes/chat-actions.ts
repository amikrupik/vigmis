// Pure helpers for parsing/sanitizing AI chat action tags.
// Kept dependency-free (no db/services) so they are trivially unit-testable.

// Action argument parser that respects pipes: [ACTION:type|arg1|arg2|...]
// Backwards compatible with the legacy colon form used for campaign actions.
export function splitActionArgs(raw: string): { type: string; args: string[] } {
  if (raw.includes('|')) {
    const [type, ...args] = raw.split('|');
    return { type: type.trim(), args: args.map((a) => a.trim()) };
  }
  const parts = raw.split(':');
  return { type: parts[0].trim(), args: parts.slice(1).map((a) => a.trim()) };
}

// Neutralize action-tag syntax in UNTRUSTED text (the user's own message, replayed
// chat history, scraped page context). Only the model's freshly-generated output is
// allowed to carry real [ACTION:...] tags — this stops a user (or injected web/comment
// content) from smuggling an executable tag into the model's context to be echoed back.
export function neutralizeActionTags(text: string | null | undefined): string {
  return (text ?? '').replace(/\[\s*ACTION\s*:/gi, '[​action:');
}

export function parseActions(text: string): Array<{ type: string; args: string[] }> {
  const regex = /\[ACTION:([^\]]+)\]/g;
  const results: Array<{ type: string; args: string[] }> = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push(splitActionArgs(match[1]));
  }
  return results;
}
