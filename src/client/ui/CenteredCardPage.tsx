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
    <Container component="main" size="xs" py="xl">
      <Paper withBorder p="xl" radius="md">
        <Stack gap="md">
          <div>
            <Title order={1} ref={titleRef} tabIndex={titleRef ? -1 : undefined}>{title}</Title>
            <Text c="dimmed" size="sm">
              {description}
            </Text>
          </div>
          {children}
        </Stack>
      </Paper>
    </Container>
  );
}
