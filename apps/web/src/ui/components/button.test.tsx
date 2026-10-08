import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, buttonVariants } from './button';

describe('Button', () => {
  it('renders an accessible button and handles clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled and is not focusable', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Delete
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toBeDisabled();
    await user.click(button);
    await user.tab();
    expect(onClick).not.toHaveBeenCalled();
    expect(button).not.toHaveFocus();
  });

  it('receives keyboard focus and activates with Enter and Space', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Go</Button>);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Go' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('exposes variant and size as data attributes and can render a child element (asChild)', () => {
    render(
      <Button asChild variant="outline" size="lg">
        <a href="/editor/">Open</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Open' });
    expect(link).toHaveAttribute('data-variant', 'outline');
    expect(link).toHaveAttribute('data-size', 'lg');
    expect(link).toHaveAttribute('href', '/editor/');
  });

  it('buttonVariants produces classes usable on other elements', () => {
    expect(buttonVariants({ variant: 'ghost' })).toContain('inline-flex');
  });
});
