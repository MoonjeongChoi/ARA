import { ReactNode } from 'react'

const maxWidthCls: Record<string, string> = {
  md: 'max-w-md',
  lg: 'max-w-lg',
}

interface ModalProps {
  onClose: () => void
  children: ReactNode
  maxWidth?: 'md' | 'lg'
}

interface SlotProps {
  children: ReactNode
  className?: string
}

function ModalRoot({ onClose, children, maxWidth = 'lg' }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidthCls[maxWidth]} overflow-hidden`}>
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ children }: SlotProps) {
  return (
    <div className="bg-pwc-dark px-6 py-4">
      <h2 className="text-base font-bold text-white">{children}</h2>
    </div>
  )
}

function ModalBody({ children, className = '' }: SlotProps) {
  return (
    <div className={`p-6 ${className}`}>
      {children}
    </div>
  )
}

function ModalFooter({ children, className = '' }: SlotProps) {
  return (
    <div className={`flex gap-3 px-6 py-4 border-t border-gray-100 ${className}`}>
      {children}
    </div>
  )
}

export const Modal = Object.assign(ModalRoot, {
  Header: ModalHeader,
  Body: ModalBody,
  Footer: ModalFooter,
})
