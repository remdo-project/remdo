import type { HTMLAttributes } from 'react';
import remdoSvgUrl from './remdo.svg';

export function RemDoIcon(props: HTMLAttributes<HTMLImageElement>) {
  return <img {...props} src={remdoSvgUrl} alt="" />;
}
