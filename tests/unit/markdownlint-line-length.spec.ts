import { lint } from 'markdownlint-cli2/markdownlint/promise';
import { describe, expect, it } from 'vitest';
import linkAwareLineLength from '../../tools/markdownlint-rules/link-aware-line-length.mjs';

async function violations(markdown: string, lineLength = 80): Promise<number[]> {
  const results = await lint({
    strings: { 'fixture.md': markdown },
    customRules: [linkAwareLineLength],
    config: {
      default: false,
      'remdo-link-aware-line-length': {
        line_length: lineLength,
      },
    },
  });
  return results['fixture.md']!.map((error) => error.lineNumber);
}

describe('remdo-link-aware-line-length', () => {
  it('counts an inline link label but not its destination, title, or delimiters', async () => {
    const line = '  Read the [configuration contract](../../specs/runtime/configuration.md#derivation-rules "owner") for details.';
    expect(line.length).toBeGreaterThan(80);
    expect(await violations(`${line}\n`)).toEqual([]);
  });

  it('still flags visible prose beyond the limit', async () => {
    const prefix = 'Visible prose '.repeat(6);
    const line = `${prefix}[owner](../../specs/runtime/configuration.md) after the link.`;
    expect(await violations(`${line}\n`)).toEqual([1]);
  });

  it('counts the visible label and reference-style labels but not reference identifiers', async () => {
    const longLabel = 'label '.repeat(13).trim();
    expect(await violations(`See [${longLabel}](./short.md) after.\n`)).toEqual([1]);

    const reference = `${'visible '.repeat(5)}[configuration contract][configuration-contract] after.\n\n[configuration-contract]: ../../specs/runtime/configuration.md\n`;
    expect(await violations(reference)).toEqual([]);
  });

  it('counts visible autolink URLs', async () => {
    const line = `Read ${'<https://example.com/visible-path>'.repeat(3)} after.`;
    expect(await violations(`${line}\n`)).toEqual([1]);
  });

  it('counts a standalone link label and exempts reference definitions', async () => {
    const label = 'long visible label '.repeat(6).trim();
    const markdown = `[${label}](https://example.com/long-destination)\n\n[target]: https://example.com/${'path/'.repeat(20)} "Long title"\n`;
    expect(await violations(markdown)).toEqual([1]);
  });

  it('preserves the final unbreakable-token exemption', async () => {
    expect(await violations(`Read ${'x'.repeat(100)}\n`)).toEqual([]);
  });

  it('counts a multi-line link continuation when its block also contains prose', async () => {
    const markdown = `Text [short label\n${'visible label '.repeat(10).trim()}](https://example.com)\n`;
    expect(await violations(markdown)).toEqual([2]);
  });

  it('counts a complete link-only source line beside soft-wrapped prose', async () => {
    const markdown = `Introductory prose\n[${'visible label '.repeat(10).trim()}](https://example.com)\n`;
    expect(await violations(markdown)).toEqual([2]);
  });

  it('does not treat inline-code prose beside a link as link-only', async () => {
    const markdown = `\`${'visible code '.repeat(10).trim()}\` [link](https://example.com)\n`;
    expect(await violations(markdown)).toEqual([1]);
  });

  it('allows zero to disable the line-length rule', async () => {
    expect(await violations(`${'visible prose '.repeat(10)}\n`, 0)).toEqual([]);
  });

  it('preserves the configured code-block and table exemptions', async () => {
    const long = 'visible prose '.repeat(10);
    const markdown = `\`\`\`text\n${long}\n\`\`\`\n\n| column |\n| --- |\n| ${long} |\n`;
    expect(await violations(markdown)).toEqual([]);
  });
});
