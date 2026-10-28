import React from 'react';
import { cn } from '../../lib/cn.js';

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  caption?: string;
}

export const Table: React.FC<TableProps> = ({ children, className, caption, ...props }) => {
  return (
    <div className="w-full overflow-x-auto border border-border rounded-md bg-surface">
      <table className={cn('w-full text-left border-collapse text-xs', className)} {...props}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
};

export const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className,
  ...props
}) => {
  return (
    <thead
      className={cn('sticky top-0 z-10 bg-surface-muted border-b border-border text-text-secondary h-8 text-[11px] font-medium uppercase tracking-wider', className)}
      {...props}
    >
      {children}
    </thead>
  );
};

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className,
  ...props
}) => {
  return (
    <tbody className={cn('divide-y divide-border', className)} {...props}>
      {children}
    </tbody>
  );
};

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
}

export const TableRow: React.FC<TableRowProps> = ({
  children,
  className,
  selected = false,
  ...props
}) => {
  return (
    <tr
      className={cn(
        'h-9 transition-colors hover:bg-surface-muted/60 text-text',
        selected && 'bg-primary-subtle/50 border-l-2 border-l-primary',
        className
      )}
      {...props}
    >
      {children}
    </tr>
  );
};

export const TableHead: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({
  children,
  className,
  ...props
}) => {
  return (
    <th className={cn('px-3 py-1.5 font-medium align-middle', className)} scope="col" {...props}>
      {children}
    </th>
  );
};

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({
  children,
  className,
  ...props
}) => {
  return (
    <td className={cn('px-3 py-1.5 align-middle', className)} {...props}>
      {children}
    </td>
  );
};
