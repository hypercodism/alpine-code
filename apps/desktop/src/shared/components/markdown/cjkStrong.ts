/** The bits of a markdown tree this step reads and writes. */
interface Node {
  type: string;
  value?: string;
  children?: Node[];
}

/** `**…**` that the parser left as words: both delimiters in one stretch of text, no line break between them. */
const LEFT_BOLD = /\*\*(?=\S)([^*\n]*?\S)\*\*/g;

/**
 * Bold that CommonMark does not see in Korean (and Chinese, Japanese) sentences: `**"설원 위의 기록"**으로` stays as
 * words with the stars showing, because a closing `**` after punctuation must be followed by a space or punctuation,
 * and a particle (으로, 은, 을) follows right away. The text the parser left with its `**` pairs becomes bold.
 */
export function remarkCjkStrong() {
  const walk = (node: Node) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child): Node[] => {
      if (child.type !== 'text' || !child.value?.includes('**')) {
        walk(child);
        return [child];
      }
      const parts: Node[] = [];
      let last = 0;
      for (const match of child.value.matchAll(LEFT_BOLD)) {
        if (match.index > last) parts.push({ type: 'text', value: child.value.slice(last, match.index) });
        parts.push({ type: 'strong', children: [{ type: 'text', value: match[1]! }] });
        last = match.index + match[0].length;
      }
      if (!parts.length) return [child];
      if (last < child.value.length) parts.push({ type: 'text', value: child.value.slice(last) });
      return parts;
    });
  };
  return (tree: Node) => walk(tree);
}
