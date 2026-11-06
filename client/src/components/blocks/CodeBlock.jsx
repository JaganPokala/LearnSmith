import { useState } from 'react';

export default function CodeBlock({ block }) {
  const [copyState, setCopyState] = useState('idle');
  const text = typeof block.text === 'string' ? block.text : '';
  const language = typeof block.language === 'string' ? block.language.trim().slice(0, 20) : '';
  const lines = text.split('\n').length;

  async function copy() {
    setCopyState('copying');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  return (
    <figure className="my-7 min-w-0 overflow-hidden rounded-xl border border-line-strong bg-panel">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className="font-mono text-xs text-dim">{language || 'Code example'} <span className="text-mute">· {lines} {lines === 1 ? 'line' : 'lines'}</span></span>
        <button type="button" onClick={copy} disabled={copyState === 'copying'} aria-label="Copy code"
          className="rounded-md px-2 py-1 text-xs font-medium text-dim hover:bg-raised hover:text-glow focus-visible:outline-2 focus-visible:outline-glow disabled:cursor-wait print:hidden">
          {copyState === 'copied' ? 'Copied ✓' : copyState === 'copying' ? 'Copying…' : 'Copy code'}
        </button>
      </figcaption>
      <pre tabIndex={0} aria-label={`${language || 'Code'} example`} className="m-0 overflow-x-auto whitespace-pre p-5 font-mono text-sm leading-[1.8] text-body focus-visible:outline-2 focus-visible:outline-glow"><code>{text}</code></pre>
      <p role="status" aria-live="polite" className={`px-4 pb-3 text-xs print:hidden ${copyState === 'error' ? 'text-warn' : 'sr-only'}`}>
        {copyState === 'copied' ? 'Code copied to clipboard.' : copyState === 'error' ? 'Copy unavailable. Select the code and copy it manually.' : ''}
      </p>
    </figure>
  );
}
