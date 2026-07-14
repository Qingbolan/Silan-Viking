import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'ds-2xs',
        'ds-xs',
        'ds-sm',
        'ds-base',
        'ds-md',
        'ds-lg',
        'ds-xl',
        'ds-2xl',
        'ds-3xl',
        'ds-4xl',
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
