import type { IconComponent } from '#client/ui/Icon';

export interface StatusDescriptor {
  key: string;
  visible: boolean;
  icon: IconComponent;
  color?: string;
  ariaLabel: string;
  title?: string;
  text?: string;
  className?: string;
}
