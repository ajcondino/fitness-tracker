import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SummaryCard } from '@/components/ui/summary-card';
import { theme } from '@/constants/theme';

describe('<SummaryCard />', () => {
  it('renders children with no header row when label is omitted', async () => {
    await render(
      <SummaryCard>
        <Text>body</Text>
      </SummaryCard>,
    );

    expect(screen.getByText('body')).toBeOnTheScreen();
  });

  it('renders the label and trailing text in the header row', async () => {
    await render(
      <SummaryCard label="HEART RATE" trailing="bpm">
        <Text>body</Text>
      </SummaryCard>,
    );

    expect(screen.getByText('HEART RATE')).toBeOnTheScreen();
    expect(screen.getByText('bpm')).toBeOnTheScreen();
    expect(screen.getByText('body')).toBeOnTheScreen();
  });

  it('ignores trailing when label is omitted', async () => {
    await render(
      <SummaryCard trailing="bpm">
        <Text>body</Text>
      </SummaryCard>,
    );

    expect(screen.queryByText('bpm')).not.toBeOnTheScreen();
  });

  it('applies the themed surface and outline colors', async () => {
    await render(
      <SummaryCard testID="card">
        <Text>body</Text>
      </SummaryCard>,
    );

    expect(screen.getByTestId('card')).toHaveStyle({
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.outline,
    });
  });
});
