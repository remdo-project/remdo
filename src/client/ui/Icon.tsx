import type { ComponentType, SVGProps } from 'react';

const ICON_SIZES = {
  inline: 18,
  button: 20,
} as const;

const DEFAULT_ICON_STROKE = 2;

type IconBaseProps = Omit<SVGProps<SVGSVGElement>, 'stroke'> & {
  size?: number | string;
  stroke?: number | string;
};

export type IconComponent = ComponentType<IconBaseProps>;

interface IconProps extends IconBaseProps {
  icon: IconComponent;
  size?: number | string;
  stroke?: number | string;
}

// Decorative icons should set aria-hidden; icon-only buttons should set aria-label.
export function Icon({
  icon: Icon,
  size = ICON_SIZES.inline,
  stroke = DEFAULT_ICON_STROKE,
  ...rest
}: IconProps) {
  const alignedStyle = {
    ...rest.style,
    transform: rest.style?.transform ?? 'translateY(0.08em)',
  };
  const ariaHidden = rest['aria-hidden'] ?? (!rest['aria-label'] && !rest['aria-labelledby']);

  return <Icon size={size} stroke={stroke} {...rest} style={alignedStyle} aria-hidden={ariaHidden} />;
}
