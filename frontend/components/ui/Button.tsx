import { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md'

const variantCls: Record<Variant, string> = {
  primary:   'bg-pwc-red text-white hover:bg-pwc-redHover disabled:opacity-50 disabled:cursor-not-allowed',
  secondary: 'border border-pwc-red text-pwc-red hover:bg-pwc-redSoft disabled:opacity-50 disabled:cursor-not-allowed',
  ghost:     'border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed',
}

const sizeCls: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-md font-medium',
  md: 'px-4 py-2.5 text-sm rounded-lg font-semibold',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`transition-colors ${variantCls[variant]} ${sizeCls[size]} ${className}`}
    >
      {children}
    </button>
  )
}
