function tokenize(el) {
  const tokens = [];
  let word = null;
  const close = () => (word = null);
  const wordNode = () => {
    if (!word) {
      word = document.createElement('span');
      word.style.whiteSpace = 'nowrap';
      tokens.push({ type: 'word', node: word });
    }
    return word;
  };

  [...el.childNodes].forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      child.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          close();
          tokens.push({ type: 'space', node: document.createTextNode(' ') });
        } else {
          wordNode().appendChild(document.createTextNode(part));
        }
      });
    } else if (child.nodeName === 'BR') {
      close();
      tokens.push({ type: 'br', node: child });
    } else if (child.hasAttribute && child.hasAttribute('data-line-attach')) {
      close();
      tokens.push({ type: 'attach', node: child });
    } else {
      wordNode().appendChild(child);
    }
  });
  return tokens;
}

export function splitLines(el) {
  const tokens = tokenize(el);
  el.textContent = '';
  tokens.forEach((t) => t.type !== 'attach' && el.appendChild(t.node));

  const lines = [];
  let current = null;
  let lastTop = null;
  let forceBreak = true;
  tokens.forEach((t) => {
    if (t.type === 'br') {
      forceBreak = true;
      return;
    }
    if (t.type === 'word') {
      const top = t.node.offsetTop;
      if (forceBreak || top !== lastTop) {
        current = [];
        lines.push(current);
        forceBreak = false;
      }
      lastTop = top;
    }
    if (current) current.push(t);
  });

  el.textContent = '';
  return lines.map((items) => {
    while (items.length && items[items.length - 1].type === 'space') items.pop();
    while (items.length && items[0].type === 'space') items.shift();
    const outer = document.createElement('span');
    outer.className = 'line';
    const inner = document.createElement('span');
    inner.className = 'line-inner';
    items.forEach((t) => inner.appendChild(t.node));
    outer.appendChild(inner);
    el.appendChild(outer);
    return inner;
  });
}
