/* eslint-disable react-refresh/only-export-components -- buttonClass is the
   intentional escape hatch for styling <Link> elements as buttons */
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export type ButtonVariant = 'ghost' | 'accent'
export type ButtonSize = 'xs' | 'sm' | 'md'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  ghost: 'border-surface-border text-foreground-muted hover:text-foreground',
  accent: 'border-status-neutral/50 bg-status-neutral-muted text-foreground',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-3 py-1.5 text-sm',
}

/**
 * Shared button styling — also usable on non-button elements (e.g. <Link>)
 * via this class helper.
 */
export function buttonClass(
  variant: ButtonVariant = 'ghost',
  size: ButtonSize = 'sm',
  className?: string,
) {
  return cn(
    'inline-flex items-center justify-center rounded border transition-colors',
    'disabled:pointer-events-none disabled:opacity-40',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({
  variant = 'ghost',
  size = 'sm',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      {...rest}
    />
  )
}

export default Button
