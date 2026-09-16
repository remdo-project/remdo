import type { ReactNode, Ref } from 'react';
import { Container, Paper, Stack, Text, Title } from '@mantine/core';

interface CenteredCardPageProps {
  children: ReactNode;
  description: string;
  title: string;
  titleRef?: Ref<HTMLHeadingElement>;
}

export default function CenteredCardPage({
  children,
  description,
  title,
  titleRef,
}: CenteredCardPageProps) {
  return (
    <Container component="main" className="remdo-card-page">
      <Paper className="remdo-card">
        <Stack className="remdo-stack">
          <div>
            <Title className="remdo-title" order={1} ref={titleRef} tabIndex={titleRef ? -1 : undefined}>{title}</Title>
            <Text className="remdo-description">
              {description}
            </Text>
          </div>
          {children}
        </Stack>
      </Paper>
    </Container>
  );
}
