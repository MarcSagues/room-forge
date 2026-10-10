import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { DeferredDropdownMenu } from './deferred-dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

function Menu({ onPick = () => {}, ...props }: { onPick?: (item: string) => void }) {
  return (
    <DeferredDropdownMenu trigger={<Button>Walls</Button>} {...props}>
      {({ DropdownMenuContent, DropdownMenuItem }, content) => (
        <DropdownMenuContent {...content}>
          <DropdownMenuItem onSelect={() => onPick('up')}>Up</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onPick('down')}>Down</DropdownMenuItem>
        </DropdownMenuContent>
      )}
    </DeferredDropdownMenu>
  );
}

describe('DeferredDropdownMenu', () => {
  it('is announced as a closed menu button before its code has loaded', () => {
    render(<Menu />);
    const trigger = screen.getByRole('button', { name: 'Walls' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on the first click, picks an item, and opens again as a plain Radix menu', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Menu onPick={onPick} />);
    await user.click(screen.getByRole('button', { name: 'Walls' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Down' }));
    expect(onPick).toHaveBeenCalledWith('down');
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Walls' }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Walls', hidden: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('opened from the keyboard, focuses the first item, and gives the focus back on Escape', async () => {
    const user = userEvent.setup();
    render(<Menu />);
    await user.tab();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Up' })).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Down' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Walls' })).toHaveFocus());
  });

  it('passes what a wrapping trigger gives it (a tooltip) to its button, before and after loading', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Menu />
          </TooltipTrigger>
          <TooltipContent>Wall display</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Walls' });
    await user.hover(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Wall display');
    await user.click(trigger);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });
});
