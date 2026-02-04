import { config } from '#config';

interface GlyphMetrics {
  width: number;
  boxLeft: number;
  boxRight: number;
}

let measureContext: CanvasRenderingContext2D | null | undefined;

const getMeasureContext = () => {
  if (measureContext !== undefined) {
    return measureContext;
  }
  if (typeof document === 'undefined') {
    measureContext = null;
    return measureContext;
  }
  try {
    const canvas = globalThis.document.createElement('canvas');
    measureContext = canvas.getContext('2d');
  } catch {
    measureContext = null;
  }
  return measureContext;
};

const parsePseudoContent = (content: string): string | null => {
  if (content === 'none' || content === 'normal') {
    return null;
  }
  if ((content.startsWith('"') && content.endsWith('"')) || (content.startsWith("'") && content.endsWith("'"))) {
    return content.slice(1, -1);
  }
  return content;
};

const resolvePseudoFont = (style: CSSStyleDeclaration) => {
  if (style.font && style.font !== 'normal') {
    return style.font;
  }
  return `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`;
};

const measureGlyphWidth = (style: CSSStyleDeclaration): GlyphMetrics | null => {
  const content = parsePseudoContent(style.content);
  const ctx = getMeasureContext();
  if (!content || !ctx) {
    return null;
  }
  ctx.font = resolvePseudoFont(style);
  const metrics = ctx.measureText(content);
  const width = metrics.width;
  if (!Number.isFinite(width) || width <= 0) {
    return null;
  }
  const left = metrics.actualBoundingBoxLeft;
  const right = metrics.actualBoundingBoxRight;
  if (Number.isFinite(left) && Number.isFinite(right) && left >= 0 && right >= 0) {
    return {
      width,
      boxLeft: left,
      boxRight: right,
    };
  }
  return {
    width,
    boxLeft: 0,
    boxRight: width,
  };
};

export const isBulletHit = (element: HTMLElement, event: PointerEvent) => {
  let pseudoStyle: CSSStyleDeclaration | null = null;
  const baseStyle = globalThis.getComputedStyle(element);
  const isChecklistItem =
    element.classList.contains('list-item-checked') || element.classList.contains('list-item-unchecked');
  if (!config.isTest) {
    try {
      pseudoStyle = globalThis.getComputedStyle(element, '::before');
    } catch {
      pseudoStyle = null;
    }
  }

  const liRect = element.getBoundingClientRect();
  if (isChecklistItem) {
    const bulletWidth = Number.parseFloat(baseStyle.getPropertyValue('--bullet-width'));
    const bulletLeft = Number.parseFloat(baseStyle.getPropertyValue('--bullet-left'));
    if (Number.isFinite(bulletWidth) && bulletWidth > 0) {
      const start = liRect.left + (Number.isFinite(bulletLeft) ? bulletLeft : 0);
      const end = start + bulletWidth;
      return event.clientX >= start && event.clientX <= end;
    }
  }
  if (!pseudoStyle) {
    const bulletWidth = Number.parseFloat(baseStyle.getPropertyValue('--bullet-width'));
    const bulletLeft = Number.parseFloat(baseStyle.getPropertyValue('--bullet-left'));
    if (Number.isFinite(bulletWidth) && bulletWidth > 0) {
      const start = liRect.left + (Number.isFinite(bulletLeft) ? bulletLeft : 0);
      const end = start + bulletWidth;
      return event.clientX >= start && event.clientX <= end;
    }
    const fallbackWidth = Number.parseFloat(baseStyle.paddingLeft);
    if (!Number.isFinite(fallbackWidth) || fallbackWidth <= 0) {
      return false;
    }
    const start = liRect.left;
    const end = start + fallbackWidth;
    return event.clientX >= start && event.clientX <= end;
  }

  const containerWidth = Number.parseFloat(pseudoStyle.width);
  const left = Number.parseFloat(pseudoStyle.left);
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return false;
  }
  const glyphMetrics = measureGlyphWidth(pseudoStyle);
  const baseLeft = liRect.left + (Number.isFinite(left) ? left : 0);
  if (!glyphMetrics) {
    const start = baseLeft;
    const end = start + containerWidth;
    return event.clientX >= start && event.clientX <= end;
  }

  let offset = 0;
  if (containerWidth > glyphMetrics.width) {
    const align = pseudoStyle.textAlign;
    if (align === 'center') {
      offset = (containerWidth - glyphMetrics.width) / 2;
    } else if (align === 'right' || align === 'end') {
      offset = containerWidth - glyphMetrics.width;
    }
  }
  const start = baseLeft + offset - glyphMetrics.boxLeft;
  const end = baseLeft + offset + glyphMetrics.boxRight;
  return event.clientX >= start && event.clientX <= end;
};
