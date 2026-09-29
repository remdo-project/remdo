import { Button, Disclosure, DisclosureGroup, DisclosurePanel, Heading } from 'react-aria-components';
import { createRoot } from 'react-dom/client';

const container = document.getElementById('landing-faq-items');
if (container) {
  requestAnimationFrame(() => {
    const details = [...container.querySelectorAll<HTMLDetailsElement>('details')];
    const items = details.map((item) => ({
      key: item.dataset.faqKey!,
      question: item.querySelector('summary > span')!.textContent,
      answer: item.querySelector('p')!.textContent,
    }));
    const expandedKeys = details.filter((item) => item.open).map((item) => item.dataset.faqKey!);
    const focusedKey = details.find((item) => item.contains(document.activeElement))?.dataset.faqKey;

    // Keep the server-rendered copy and any interaction before enhancement.
    createRoot(container).render(
      <DisclosureGroup defaultExpandedKeys={expandedKeys} allowsMultipleExpanded={false}>
        {items.map((item) => (
          <Disclosure key={item.key} id={item.key} className="landing-faq-item" data-faq-key={item.key}>
            <Heading level={3}>
              <Button
                slot="trigger"
                className="landing-faq-question"
                ref={(button) => {
                  if (item.key === focusedKey) button?.focus({ preventScroll: true });
                }}
              >
                <span>{item.question}</span><span className="landing-faq-icon" aria-hidden="true" />
              </Button>
            </Heading>
            <DisclosurePanel className="landing-faq-panel">
              <div className="landing-faq-answer"><p>{item.answer}</p></div>
            </DisclosurePanel>
          </Disclosure>
        ))}
      </DisclosureGroup>,
    );
  });
}
