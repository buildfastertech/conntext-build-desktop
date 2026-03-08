import { useState, useCallback } from 'react'
import type { UserQuestion } from '../../../preload/index.d'

interface QuestionDialogProps {
  question: UserQuestion
  onSubmit: (questionId: string, response: string) => void
}

export function QuestionDialog({ question, onSubmit }: QuestionDialogProps) {
  const { questionId, questions } = question

  // Track selections per question index
  const [selections, setSelections] = useState<Map<number, Set<string>>>(new Map())
  const [freeTextValues, setFreeTextValues] = useState<Map<number, string>>(new Map())
  const [isSubmitting, setIsSubmitting] = useState(false)

  const toggleOption = useCallback((qIndex: number, label: string, multiSelect: boolean) => {
    setSelections((prev) => {
      const next = new Map(prev)
      const current = new Set(next.get(qIndex) || [])

      if (multiSelect) {
        if (current.has(label)) {
          current.delete(label)
        } else {
          current.add(label)
        }
      } else {
        // Single-select: clear and set
        current.clear()
        current.add(label)
      }

      next.set(qIndex, current)
      return next
    })
  }, [])

  const setFreeText = useCallback((qIndex: number, value: string) => {
    setFreeTextValues((prev) => {
      const next = new Map(prev)
      next.set(qIndex, value)
      return next
    })
  }, [])

  const handleSubmit = useCallback(() => {
    setIsSubmitting(true)

    // Build structured JSON response so the agent can parse it unambiguously
    const answers: Array<{ question: string; selected: string[] }> = []

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const selected = selections.get(i)
      const freeText = freeTextValues.get(i)?.trim()

      const selectedValues: string[] = []
      if (selected && selected.size > 0) {
        selectedValues.push(...selected)
      }
      if (freeText) {
        selectedValues.push(freeText)
      }

      answers.push({
        question: q.question,
        selected: selectedValues.length > 0 ? selectedValues : ['(No selection)'],
      })
    }

    const response = JSON.stringify({ status: 'answered', answers })
    onSubmit(questionId, response)
  }, [questionId, questions, selections, freeTextValues, onSubmit])

  // Check if at least one question has a selection or free text
  const hasAnyInput = questions.some((_, i) => {
    const selected = selections.get(i)
    const freeText = freeTextValues.get(i)?.trim()
    return (selected && selected.size > 0) || !!freeText
  })

  return (
    <div className="my-3 mx-1 animate-fade-in-up">
      <div className="rounded-xl border border-brand-purple/30 bg-brand-card-elevated overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-brand-border-subtle bg-brand-purple/5">
          <span className="text-brand-purple text-sm">?</span>
          <span className="text-xs font-medium text-brand-text-secondary">
            {questions.length === 1 ? 'Question' : `${questions.length} Questions`}
          </span>
        </div>

        {/* Questions */}
        <div className="p-4 space-y-5">
          {questions.map((q, qIndex) => {
            const selected = selections.get(qIndex) || new Set<string>()

            return (
              <div key={qIndex} className="space-y-2.5">
                {/* Question text */}
                <p className="text-sm text-brand-text font-medium leading-relaxed">
                  {q.question}
                </p>

                {/* Options */}
                {q.options && q.options.length > 0 && (
                  <div className="space-y-1.5">
                    {q.options.map((opt) => {
                      const isSelected = selected.has(opt.label)

                      return (
                        <button
                          key={opt.label}
                          onClick={() => toggleOption(qIndex, opt.label, q.multiSelect ?? false)}
                          disabled={isSubmitting}
                          className={`
                            w-full text-left px-3 py-2.5 rounded-lg border transition-all duration-150 cursor-pointer
                            ${isSelected
                              ? 'border-brand-purple bg-brand-purple/10 text-brand-text'
                              : 'border-brand-border hover:border-brand-purple/40 hover:bg-brand-card text-brand-text-secondary'
                            }
                            ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                        >
                          <div className="flex items-start gap-2.5">
                            {/* Radio / Checkbox indicator */}
                            <div className={`
                              mt-0.5 flex-shrink-0 w-4 h-4 rounded-${q.multiSelect ? 'sm' : 'full'}
                              border-2 transition-colors flex items-center justify-center
                              ${isSelected
                                ? 'border-brand-purple bg-brand-purple'
                                : 'border-brand-text-dim'
                              }
                            `}>
                              {isSelected && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium">{opt.label}</span>
                              {opt.description && (
                                <p className="text-xs text-brand-text-muted mt-0.5 leading-relaxed">
                                  {opt.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Free text input */}
                {(q.freeText || (!q.options || q.options.length === 0)) && (
                  <textarea
                    value={freeTextValues.get(qIndex) || ''}
                    onChange={(e) => setFreeText(qIndex, e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Type your response..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-brand-input-border bg-brand-input text-sm text-brand-text placeholder-brand-text-dim focus:outline-none focus:border-brand-purple resize-none"
                  />
                )}

                {/* Separator between questions */}
                {qIndex < questions.length - 1 && (
                  <div className="border-t border-brand-border-subtle" />
                )}
              </div>
            )
          })}
        </div>

        {/* Submit button */}
        <div className="px-4 pb-4">
          <button
            onClick={handleSubmit}
            disabled={!hasAnyInput || isSubmitting}
            className={`
              w-full py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer
              ${hasAnyInput && !isSubmitting
                ? 'bg-brand-purple hover:bg-brand-purple-dim text-white'
                : 'bg-brand-border text-brand-text-dim cursor-not-allowed'
              }
            `}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Submitting...
              </span>
            ) : (
              'Submit'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
