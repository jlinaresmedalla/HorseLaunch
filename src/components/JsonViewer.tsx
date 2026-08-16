import { useState } from 'react';

interface JsonViewerProps {
  content: string;
  maxPreviewLength?: number;
}

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const renderValue = (value: any, indent: number = 0): string => {
  const spaces = '  '.repeat(indent);
  const nextSpaces = '  '.repeat(indent + 1);
  
  if (value === null) {
    return `<span class="json-token json-token--null">null</span>`;
  }
  
  if (typeof value === 'string') {
    return `<span class="json-token json-token--string">"${escapeHtml(value)}"</span>`;
  }
  
  if (typeof value === 'number') {
    return `<span class="json-token json-token--number">${value}</span>`;
  }
  
  if (typeof value === 'boolean') {
    return `<span class="json-token json-token--boolean">${value}</span>`;
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `<span class="json-token json-token--bracket">[]</span>`;
    }
    const items = value.map(v => renderValue(v, indent + 1)).join(`,<br/>${nextSpaces}`);
    return `<span class="json-token json-token--bracket">[</span><br/>${nextSpaces}${items}<br/>${spaces}<span class="json-token json-token--bracket">]</span>`;
  }
  
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return `<span class="json-token json-token--bracket">{}</span>`;
    }
    const items = entries.map(([k, v]) => 
      `${nextSpaces}<span class="json-token json-token--key">"${escapeHtml(k)}"</span>: ${renderValue(v, indent + 1)}`
    ).join(`,<br/>`);
    return `<span class="json-token json-token--bracket">{</span><br/>${items}<br/>${spaces}<span class="json-token json-token--bracket">}</span>`;
  }
  
  return String(value);
};

export const JsonViewer = ({ content, maxPreviewLength = 80 }: JsonViewerProps) => {
  const [expanded, setExpanded] = useState(true);
  
  try {
    const parsed = JSON.parse(content);
    const isValid = true;
    
    if (!isValid) {
      return <span>{content}</span>;
    }
    
    const htmlContent = renderValue(parsed);
    
    // Vista colapsada: mostrar preview
    const preview = content.length > maxPreviewLength 
      ? content.slice(0, maxPreviewLength) + '...' 
      : content;
    
    return (
      <div className="json-viewer" style={{ fontFamily: 'monospace', display: 'inline-block' }}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="json-viewer__toggle inline-flex items-center gap-1 mr-2"
          style={{ 
            background: 'none', 
            border: 'none', 
            padding: 0,
            cursor: 'pointer',
            fontSize: '10px'
          }}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▼' : '▶'}
        </button>
        {expanded ? (
          <div 
            dangerouslySetInnerHTML={{ __html: htmlContent }} 
            style={{ display: 'inline-block' }}
          />
        ) : (
          <span className="json-viewer__preview" onClick={() => setExpanded(true)}>
            {preview}
          </span>
        )}
      </div>
    );
  } catch {
    // No es JSON válido, devolver el contenido original
    return <span>{content}</span>;
  }
};

// Función helper para detectar si una línea es JSON
export const isJsonLine = (content: string): boolean => {
  const trimmed = content.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'));
};
