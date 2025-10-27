import { ReactNode } from 'react'

type AccordionProps = {
  title: string
  content: ReactNode
  isOpen: boolean
  onToggle: () => void
}

export const Accordion = ({ title, content, isOpen, onToggle }: AccordionProps) => {
  return (
    <div className="border-t border-gray-200 pt-4">
      <button
        onClick={onToggle}
        className='text-xl text-blue-700 underline hover:text-blue-900 transition-colors w-full text-left'
      >
        {isOpen ? '▼' : '▶'} {title}
      </button>
      {isOpen && (
        <div className="mt-4 animate-fadeIn">
          {content}
        </div>
      )}
    </div>
  )
}