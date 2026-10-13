import type { ReactNode } from 'react';
import { Tooltip, TooltipTrigger } from 'react-aria-components';
import './styles/action-tooltip.css';

export function ActionTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipTrigger delay={200}>
      {children}
      <Tooltip className="remdo-action-tooltip" offset={8}>
        {label}
      </Tooltip>
    </TooltipTrigger>
  );
}
