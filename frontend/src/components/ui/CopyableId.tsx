import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export interface CopyableIdProps {
  id: string;
  truncate?: boolean;
  className?: string;
}

export const CopyableId: React.FC<CopyableIdProps> = ({ id, truncate = true, className }) => {
  const [copied, setCopied] = useState(false);

  const displayId =
    truncate && id.length > 18
      ? `${id.substring(0, 10)}...${id.substring(id.length - 6)}`
      : id;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono text-xs text-text hover:text-primary transition-colors group cursor-pointer',
        className
      )}
      onClick={handleCopy}
      title={`Click to copy: ${id}`}
    >
      <span className="tabular-nums">{displayId}</span>
      <button
        type="button"
        className="p-0.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-primary transition-opacity focus:outline-none"
        aria-label="Copy ID"
      >
        {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
      </button>
    </span>
  );
};
