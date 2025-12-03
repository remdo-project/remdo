const APPLE_PATTERN = /Mac(?:intosh)?|iPhone|iPad|iPod/i;

type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } };

function isApplePlatform(): boolean {
  const nav: NavigatorWithUAData | null = typeof navigator === 'undefined' ? null : (navigator as NavigatorWithUAData);
  const source = nav?.userAgentData?.platform ?? nav?.userAgent ?? '';
  return APPLE_PATTERN.test(source);
}

export const IS_APPLE_PLATFORM = isApplePlatform();
