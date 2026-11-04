/** Turns an assistant answer (markdown) into plain sentences for reading aloud. */
export function speechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*(\d+)[.)]\s+/gm, 'Step $1. ')
    .replace(/(\*\*|__|\*|_|`|~~)/g, '')
    .replace(/\s*\n+\s*/g, (m) => (m.includes('\n\n') ? '. ' : ' '))
    .replace(/([.!?:;])\s*\.\s/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
