import { ReactNode } from 'react'

type AccordionProps = {
  title: string
  content: ReactNode
  isOpen: boolean
  onToggle: () => void
}

export const Accordion = ({ title, content, isOpen, onToggle }: AccordionProps) => {
  return (
    <div>
      <button onClick={onToggle} className='text-xl text-blue-700 underline'>{title}</button>
      {isOpen && <div>{content}</div>}
    </div>
  )
}